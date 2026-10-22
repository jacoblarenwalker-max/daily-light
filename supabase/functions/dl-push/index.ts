// dl-push: Web Push for Daily Light (household-meals Supabase project; separate from wb-push / push-notify).
// Callers:
//   * the database (pg_cron -> private.dl_send_morning -> pg_net) with header x-dl-secret:
//       { action: 'morning', user_id, local_day }  sends the text stored in dl_morning_sends to that person
//       { action: 'init' }                         one-time: creates the VAPID key pair inside Vault
//   * a signed-in member (Authorization: Bearer <user JWT>): { action: 'test' } sends to their own devices
// Secrets (VAPID private key, webhook secret) live only in Supabase Vault (dl_ names); nothing secret is in the repo.
import postgres from 'npm:postgres@3.4.5';
import { generateVapidKeys, sendWebPush } from './webpush.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://voydoxmxdnjnewxlwzse.supabase.co';
const PUBLIC_API_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_FO-tgfKuBTb19W8GaX1qZw_dtZRRdqY';
const SUBJECT = 'mailto:jacoblarenwalker-max@users.noreply.github.com';
const ALLOWED_ORIGINS = ['https://jacoblarenwalker-max.github.io', 'http://127.0.0.1:8766'];

const corsFor = (req: Request) => {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(req), 'Content-Type': 'application/json' } });

async function vaultSecret(name: string): Promise<string | null> {
  const r = await sql`select decrypted_secret from vault.decrypted_secrets where name = ${name} limit 1`;
  return r[0]?.decrypted_secret ?? null;
}
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

let vapidCache: { privateJwk: JsonWebKey; publicKey: string; subject: string } | null = null;
async function vapid() {
  if (vapidCache) return vapidCache;
  const [jwk, pub] = await Promise.all([vaultSecret('dl_push_vapid_private_jwk'), vaultSecret('dl_push_vapid_public_key')]);
  if (!jwk || !pub) throw new Error('VAPID keys not initialised');
  vapidCache = { privateJwk: JSON.parse(jwk), publicKey: pub, subject: SUBJECT };
  return vapidCache;
}
async function initVapid() {
  const existing = await vaultSecret('dl_push_vapid_public_key');
  if (existing) return { created: false, publicKey: existing };
  const k = await generateVapidKeys();
  await sql`select vault.create_secret(${JSON.stringify(k.privateJwk)}, 'dl_push_vapid_private_jwk', 'Daily Light Web Push VAPID private key (JWK)')`;
  await sql`select vault.create_secret(${k.publicKey}, 'dl_push_vapid_public_key', 'Daily Light Web Push VAPID public key')`;
  return { created: true, publicKey: k.publicKey };
}

type Sub = { id: string; endpoint: string; keys: { p256dh: string; auth: string } };
async function deliver(subs: Sub[], message: Record<string, unknown>, topic?: string) {
  const v = await vapid();
  const payload = JSON.stringify(message);
  let sent = 0, failed = 0, removed = 0;
  for (const s of subs) {
    try {
      const r = await sendWebPush(s, payload, v, { topic });
      if (r.ok) { sent++; await sql`update public.dl_push_subscriptions set last_success_at = now() where id = ${s.id}`; }
      else if (r.gone) { removed++; await sql`delete from public.dl_push_subscriptions where id = ${s.id}`; }
      else { failed++; console.warn('push failed', r.status, r.text); }
    } catch (e) { failed++; console.warn('push error', String(e)); }
  }
  return { sent, failed, removed };
}
const memberSubs = (userId: string) =>
  sql`select s.id, s.endpoint, s.keys from public.dl_push_subscriptions s join public.dl_members m on m.user_id = s.user_id where s.user_id = ${userId}::uuid` as unknown as Promise<Sub[]>;

async function morning(userId: string, day: string) {
  const [r] = await sql`select title, body, dry_run from public.dl_morning_sends where user_id = ${userId}::uuid and local_day = ${day}::date`;
  if (!r) return { status: 404, body: { error: 'no morning message for that person and day' } };
  const subs = await memberSubs(userId);
  if (r.dry_run) return { status: 200, body: { dry_run: true, would_send: subs.length, title: r.title } };
  const out = subs.length ? await deliver(subs, { title: r.title, body: r.body, url: './#/today', tag: 'morning' }, 'morning') : { sent: 0, failed: 0, removed: 0 };
  return { status: 200, body: { recipients: subs.length, ...out } };
}

async function userFromToken(token: string): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: PUBLIC_API_KEY } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST only' });
  let input: Record<string, any> = {};
  try { input = await req.json(); } catch { return json(req, 400, { error: 'bad json' }); }
  try {
    const given = req.headers.get('x-dl-secret') || '';
    if (given) {
      const expected = await vaultSecret('dl_push_webhook_secret');
      if (!expected || !sameSecret(given, expected)) return json(req, 401, { error: 'unauthorized' });
      if (input.action === 'init') return json(req, 200, await initVapid());
      if (input.action === 'morning' && input.user_id && input.local_day) { const r = await morning(String(input.user_id), String(input.local_day)); return json(req, r.status, r.body); }
      return json(req, 400, { error: 'unknown action' });
    }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = token ? await userFromToken(token) : null;
    if (!uid) return json(req, 401, { error: 'sign in first' });
    const [isMember] = await sql`select 1 from public.dl_members where user_id = ${uid}::uuid`;
    if (!isMember) return json(req, 403, { error: 'not allowed' });
    if (input.action === 'test') {
      const subs = await memberSubs(uid);
      if (!subs.length) return json(req, 404, { error: 'no devices with notifications on' });
      const out = await deliver(subs, { title: 'Daily Light', body: 'Notifications are working on this device. ☀️', url: './#/settings', tag: 'test' });
      return json(req, 200, { recipients: subs.length, ...out });
    }
    return json(req, 400, { error: 'unknown action' });
  } catch (e) {
    console.error('dl-push error', String(e));
    return json(req, 500, { error: 'internal error' });
  }
});
