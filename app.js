import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VAPID_PUBLIC_KEY, PUSH_FUNCTION } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const $app = document.getElementById('app');
const TZ = 'America/Denver';
const PEOPLE = ['jacob', 'sophie'];
const S = { person: PEOPLE.includes(localStorage.getItem('dl-person')) ? localStorage.getItem('dl-person') : null, me: null, members: [], today: [], day: null, books: [], quotes: new Map(), favs: [], insights: [], route: 'today', bookId: null, favFilter: 'all' };

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');
const localDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prettyDay = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const when = (ts) => {
  const d = new Date(ts), now = new Date(), mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  if (localDay(d) === localDay(now)) return `Today · ${t}`;
  if (localDay(d) === localDay(new Date(now - 864e5))) return `Yesterday · ${t}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', timeZone: TZ }) + ` · ${t}`;
};
const nameOf = (p) => S.members.find((m) => m.person === p)?.display_name || (p === 'sophie' ? 'Sophie' : p === 'jacob' ? 'Jacob' : 'Someone');
const otherName = () => nameOf(S.person === 'jacob' ? 'sophie' : 'jacob');
let toastT;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
const greeting = () => { const hr = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()); return hr < 5 ? 'Peaceful night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; };

const I = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="4.2"/><path d="M12 3.5v2.2M4.9 6.4l1.6 1.5M19.1 6.4l-1.6 1.5M2.8 13H5M19 13h2.2M3 19.5h18"/></svg>',
  books: '<svg viewBox="0 0 24 24"><path d="M4 19.5V5a1.5 1.5 0 0 1 1.5-1.5H9V20H5.5A1.5 1.5 0 0 1 4 18.5"/><path d="M9 3.5h3.5V20H9"/><path d="m14.5 5.2 3.2-.9 3 13.6-3.2.9z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 4.5h14v11.5l-4.5 4H5z"/><path d="M14.5 20v-4h4.5M8.5 9h7M8.5 12.5h5"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.5 4 4.3 7.3 4.3c2 0 3.5 1.1 4.7 2.7 1.2-1.6 2.7-2.7 4.7-2.7 3.3 0 5.6 3.2 4.5 6.6-1.6 4.8-9.2 9.4-9.2 9.4z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
};

// ---------- data ----------
async function loadMembers() {
  const { data, error } = await sb.from('dl_people').select('*');
  if (error) throw error;
  S.members = data || [];
  S.me = S.members.find((m) => m.person === S.person) || null;
}
async function loadToday(day = S.day || localDay()) {
  S.day = day;
  const { data, error } = await sb.rpc('dl_today', { p_day: day });
  if (error) throw error;
  S.today = data || [];
  for (const q of S.today) S.quotes.set(q.id, q);
}
async function loadBooks() {
  const [{ data: books, error: e1 }, { data: qs, error: e2 }] = await Promise.all([
    sb.from('dl_books').select('*').order('created_at'),
    sb.from('dl_quotes').select('*').eq('kind', 'book').order('seq'),
  ]);
  if (e1 || e2) throw e1 || e2;
  S.books = books || [];
  for (const q of qs || []) S.quotes.set(q.id, q);
  S.bookQuotes = qs || [];
}
async function loadFavs() {
  const { data, error } = await sb.from('dl_favorites').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  S.favs = data || [];
  const missing = [...new Set(S.favs.map((f) => f.quote_id))].filter((id) => !S.quotes.has(id));
  if (missing.length) { const { data: qs } = await sb.from('dl_quotes').select('*').in('id', missing); for (const q of qs || []) S.quotes.set(q.id, q); }
}
async function loadInsights() {
  const { data, error } = await sb.from('dl_insights').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  S.insights = data || [];
  const missing = [...new Set(S.insights.map((n) => n.quote_id).filter(Boolean))].filter((id) => !S.quotes.has(id));
  if (missing.length) { const { data: qs } = await sb.from('dl_quotes').select('*').in('id', missing); for (const q of qs || []) S.quotes.set(q.id, q); }
}
const bookOf = (q) => S.books.find((b) => b.id === q.book_id);

// ---------- quote rendering ----------
function citeHtml(q) {
  if (q.kind === 'scripture') return h`<strong>${esc(q.citation)}</strong> · Book of Mormon${q.url ? h` · <a href="${esc(q.url)}" target="_blank" rel="noopener">Read chapter</a>` : ''}`;
  if (q.kind === 'conference') return h`<strong>${esc(q.speaker)}</strong>${q.speaker_role ? h`<br><span class="muted small">${esc(q.speaker_role)}</span>` : ''}<br><a href="${esc(q.url)}" target="_blank" rel="noopener">“${esc(q.talk_title)}”</a> <span class="muted small">· ${esc(q.conference || 'General Conference')}</span>`;
  const b = bookOf(q);
  return h`<strong>${esc(b?.title || 'Book')}</strong>${b ? h` · ${esc(b.author)}` : ''}${q.chapter ? h`<br><span class="muted small">${esc(q.chapter)}</span>` : ''}`;
}
const kindLabel = { scripture: 'Book of Mormon', conference: 'General Conference', book: 'From the shelf' };
function favWho(qid) {
  const who = S.favs.filter((f) => f.quote_id === qid).map((f) => f.person);
  if (!who.length) return '';
  if (who.length >= 2) return 'Loved by you both';
  return who[0] === S.person ? '' : `${nameOf(who[0])} loves this`;
}
function quoteCard(q, opts = {}) {
  const mine = S.favs.some((f) => f.quote_id === q.id && f.person === S.person);
  return h`<article class="card quote ${q.kind}" data-qid="${q.id}">
    ${opts.noLabel ? '' : h`<div class="label"><span class="dot"></span>${kindLabel[q.kind]}</div>`}
    <p class="qtext ${q.body.length > 260 ? 'long' : ''}">${esc(q.body)}</p>
    <div class="cite">${citeHtml(q)}</div>
    <div class="actions">
      <button class="act ${mine ? 'hearted' : ''}" data-act="heart" data-qid="${q.id}" aria-pressed="${mine}" aria-label="${mine ? 'Remove from favorites' : 'Add to favorites'}">${I.heart}<span>${mine ? 'Saved' : 'Save'}</span></button>
      <button class="act" data-act="insight" data-qid="${q.id}">${I.pen}<span>Insight</span></button>
      ${navigator.share ? h`<button class="act" data-act="share" data-qid="${q.id}" aria-label="Share">${I.share}</button>` : ''}
      <span class="who">${esc(favWho(q.id))}</span>
      ${opts.deletable && !q.seeded ? h`<button class="act danger" data-act="delquote" data-qid="${q.id}">Delete</button>` : ''}
    </div>
  </article>`;
}

// ---------- screens ----------
function header(kicker, title, sub) {
  const gear = S.route === 'settings' ? '' : h`<button class="iconbtn" data-go="settings" aria-label="Settings">${I.gear}</button>`;
  return h`<header class="top"><div><div class="kicker">${kicker}</div><h1 class="hello">${title}</h1>${sub ? h`<div class="sub">${sub}</div>` : ''}</div>${gear}</header>`;
}
function tabs() {
  const t = (id, icon, label) => h`<a href="#/${id}" class="${S.route === id || (id === 'shelf' && S.route === 'book') ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  return h`<nav class="tabs" aria-label="Sections">${t('today', I.sun, 'Today')}${t('shelf', I.books, 'Bookshelf')}${t('insights', I.note, 'Insights')}${t('favorites', I.heart, 'Favorites')}</nav>`;
}
function vToday() {
  const isToday = S.day === localDay();
  const body = S.today.length ? S.today.map((q) => quoteCard(q)).join('') : '<div class="empty"><span class="glyph">☀️</span>Nothing here yet.</div>';
  return header(prettyDay(S.day), isToday ? `${greeting()}, ${esc(S.me.display_name)}` : 'A past morning', isToday ? 'Three quiet lines for today. Same for you both.' : '') +
    h`<div class="daynav"><button data-act="prevday">‹ Earlier</button><button class="today-pill" data-act="today" ${isToday ? 'disabled' : ''}>${isToday ? 'Today' : 'Back to today'}</button><button data-act="nextday" ${isToday ? 'disabled' : ''}>Later ›</button></div>` +
    h`<section>${body}</section>`;
}
const spineColors = ['linear-gradient(160deg,#E2795F,#C2577A)', 'linear-gradient(160deg,#E9A94F,#D9774B)', 'linear-gradient(160deg,#3E4A7A,#2A2D5C)', 'linear-gradient(160deg,#8C7AC8,#5E4F9C)', 'linear-gradient(160deg,#4E8F86,#2F6460)', 'linear-gradient(160deg,#B0714A,#7E4B30)'];
function vShelf() {
  const n = (id) => (S.bookQuotes || []).filter((q) => q.book_id === id).length;
  return header('Bookshelf', 'Lines worth keeping', 'One short line from these books appears each day.') +
    h`<div class="shelf">${S.books.map((b, i) => h`<button class="spine" style="background:${spineColors[i % spineColors.length]};animation-delay:${i * 0.05}s" data-book="${b.id}"><span class="n">${n(b.id)}</span><span class="t">${esc(b.title)}</span><span class="a">${esc(b.author)}</span></button>`).join('')}
      <button class="spine add" data-act="addbook">+ Add a book</button></div>`;
}
function vBook() {
  const b = S.books.find((x) => x.id === S.bookId);
  if (!b) { location.hash = '#/shelf'; return ''; }
  const qs = (S.bookQuotes || []).filter((q) => q.book_id === b.id);
  return h`<button class="back" data-go="shelf">‹ Bookshelf</button>` + header(esc(b.author), esc(b.title), `${qs.length} ${qs.length === 1 ? 'quote' : 'quotes'}`) +
    h`<div class="row" style="margin-bottom:16px"><button class="btn block" data-act="addquote" data-book="${b.id}">+ Add a quote</button>${!b.seeded ? h`<button class="btn ghost danger" data-act="delbook" data-book="${b.id}" style="flex:0 0 auto">Delete book</button>` : ''}</div>` +
    (qs.length ? qs.map((q) => quoteCard(q, { noLabel: true, deletable: true })).join('') : '<div class="empty"><span class="glyph">📖</span>No quotes yet. Add a favorite line, word for word.</div>');
}
function linkedHtml(qid) {
  const q = qid && S.quotes.get(qid);
  if (!q) return '';
  const src = q.kind === 'scripture' ? q.citation : q.kind === 'conference' ? `${q.speaker}, “${q.talk_title}”` : `${bookOf(q)?.title || 'Book'}`;
  const txt = q.body.length > 180 ? q.body.slice(0, 177) + '…' : q.body;
  return h`<div class="linked">${esc(txt)}<span class="src">${esc(src)}</span></div>`;
}
function vInsights() {
  const list = S.insights.map((n, i) => {
    const nm = nameOf(n.author);
    return h`<article class="card note" style="animation-delay:${Math.min(i, 8) * 0.04}s"><div class="meta"><span class="avatar ${n.author === 'sophie' ? 's' : 'j'}">${esc(nm[0])}</span><div><div class="name">${esc(nm)}</div><div class="time">${when(n.created_at)}${n.updated_at && new Date(n.updated_at) - new Date(n.created_at) > 60000 ? ' · edited' : ''}</div></div>
      ${n.author === S.person ? h`<span style="margin-left:auto"><button class="act" data-act="editnote" data-id="${n.id}">Edit</button></span>` : ''}</div>
      <div class="body">${esc(n.body)}</div>${linkedHtml(n.quote_id)}</article>`;
  }).join('');
  return header('Insights', 'What we’re learning', `Shared between you and ${esc(otherName())}.`) +
    h`<button class="btn block" data-act="newnote" style="margin-bottom:16px">${I.pen.replace('<svg', '<svg width="18" height="18" stroke="#fff" fill="none" stroke-width="1.8"')} Write an insight</button>` +
    (list || '<div class="empty"><span class="glyph">✍️</span>No insights yet.<br>Write the first thought of the day.</div>');
}
function vFavorites() {
  const f = S.favFilter, me = S.person;
  const byQ = new Map();
  for (const x of S.favs) { if (!byQ.has(x.quote_id)) byQ.set(x.quote_id, []); byQ.get(x.quote_id).push(x.person); }
  let ids = [...byQ.keys()];
  if (f === 'mine') ids = ids.filter((id) => byQ.get(id).includes(me));
  if (f === 'theirs') ids = ids.filter((id) => byQ.get(id).some((u) => u !== me));
  if (f === 'both') ids = ids.filter((id) => byQ.get(id).length >= 2);
  const chip = (k, l) => h`<button class="chip ${f === k ? 'on' : ''}" data-fav="${k}">${l}</button>`;
  return header('Favorites', 'Hearted lines', '') +
    h`<div class="chips">${chip('all', 'All')}${chip('mine', 'Mine')}${chip('theirs', esc(otherName()) + '’s')}${chip('both', 'Both')}</div>` +
    (ids.filter((id) => S.quotes.has(id)).map((id) => quoteCard(S.quotes.get(id))).join('') || '<div class="empty"><span class="glyph">♡</span>Tap Save on any quote to keep it here.</div>');
}
const TZS = ['America/Denver', 'America/Boise', 'America/Phoenix', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'Pacific/Honolulu', 'America/Anchorage'];
function vSettings() {
  const m = S.me, th = localStorage.getItem('dl-theme') || 'auto';
  const tzs = TZS.includes(m.tz) ? TZS : [m.tz, ...TZS];
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window;
  return h`<button class="back" data-go="today">‹ Today</button>` + header('Settings', esc(m.display_name), 'Reading on this device') +
    h`<section class="card set">
      <h3>Morning notification</h3>
      <p class="muted small tight" id="push-state">${pushOk ? 'Checking this phone…' : 'This browser can’t receive notifications. On iPhone, add Daily Light to your Home Screen first (Share → Add to Home Screen), then open it from there.'}</p>
      <div id="push-warn" class="warn" hidden></div>
      <div id="push-actions" class="push-actions"></div>
      <div class="set-fields">
        <label class="f" for="s-time">Time</label><input type="time" id="s-time" value="${esc(String(m.notify_time).slice(0, 5))}">
        <label class="f" for="s-tz">Time zone</label><select id="s-tz">${tzs.map((z) => h`<option ${z === m.tz ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>
        <p class="muted small tight">Each of you picks your own time. It arrives within about 5 minutes of it.</p>
        <button class="btn ghost block" data-act="savenotify">Save time</button>
      </div>
    </section>
    <section class="card set">
      <h3>Your name</h3>
      <div class="row name-row"><input id="s-name" value="${esc(m.display_name)}" maxlength="40"><button class="btn save-inline" data-act="savename">Save</button></div>
    </section>
    <section class="card set">
      <h3>Appearance</h3>
      <div class="chips tight">${['auto', 'light', 'dark'].map((k) => h`<button class="chip ${th === k ? 'on' : ''}" data-theme-set="${k}">${k === 'auto' ? 'Match phone' : k === 'light' ? 'Morning' : 'Evening'}</button>`).join('')}</div>
    </section>
    <section class="card set">
      <h3>Who’s reading here?</h3>
      <p class="muted small tight">This device is set to ${esc(m.display_name)}. Your favorites, insights and morning time follow this choice.</p>
      <button class="btn ghost block" data-act="switch">Switch to ${esc(otherName())}</button>
    </section>
    <p class="muted small foot-note">Scripture: Book of Mormon (public-domain text). Conference talks © Intellectual Reserve, Inc., quoted briefly with links to the full talks.</p>`;
}
function vPicker() {
  const card = (p, name, cls) => h`<button class="who-card ${cls}" data-person="${p}"><span class="avatar big ${cls}">${name[0]}</span><span class="who-name">${name}</span></button>`;
  return h`<div class="signin picker"><img class="mark" src="icon.svg?v=dl1" alt=""><h1>Daily Light</h1><p class="tag">Who’s reading?</p>
    <div class="who-grid">${card('jacob', 'Jacob', 'j')}${card('sophie', 'Sophie', 's')}</div>
    <p class="muted small" style="text-align:center;margin-top:22px">You can change this anytime in Settings.</p></div>`;
}

function render() {
  if (!S.person) { $app.innerHTML = vPicker(); return; }
  if (!S.me) { $app.innerHTML = '<div class="boot"><p>Opening…</p></div>'; return; }
  const v = { today: vToday, shelf: vShelf, book: vBook, insights: vInsights, favorites: vFavorites, settings: vSettings }[S.route] || vToday;
  $app.innerHTML = v() + tabs();
  if (S.route === 'settings') refreshPushState();
}

// ---------- sheets ----------
function sheet(inner, onSubmit) {
  const el = document.createElement('div');
  el.className = 'scrim';
  el.innerHTML = h`<form class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</form>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try { if ((await onSubmit(el)) !== false) close(); } catch (err) { toast(err.message || 'Something went wrong'); } finally { if (btn) btn.disabled = false; }
  });
  setTimeout(() => el.querySelector('textarea, input')?.focus(), 120);
  return el;
}
function noteSheet(note = null, quoteId = null) {
  const qid = note ? note.quote_id : quoteId;
  const opts = [...new Map([...S.today, ...(qid && S.quotes.get(qid) ? [S.quotes.get(qid)] : [])].map((q) => [q.id, q])).values()];
  const pick = (q) => h`<button type="button" class="pick ${q.id === qid ? 'on' : ''}" data-pick="${q.id}">${esc(q.body.length > 110 ? q.body.slice(0, 107) + '…' : q.body)}<small>${esc(q.kind === 'scripture' ? q.citation : q.kind === 'conference' ? q.speaker : bookOf(q)?.title || 'Book')}</small></button>`;
  const el = sheet(h`<h2>${note ? 'Edit insight' : 'New insight'}</h2><p class="muted small">${esc(otherName())} will see this right away.</p>
    <textarea class="serif" id="n-body" maxlength="4000" required placeholder="What stood out to you?">${esc(note?.body || '')}</textarea>
    <label class="f">Link to a quote (optional)</label>
    <button type="button" class="pick ${!qid ? 'on' : ''}" data-pick="">No quote</button>${opts.map(pick).join('')}
    <div class="foot">${note ? '<button type="button" class="btn ghost danger" data-del>Delete</button>' : '<button type="button" class="btn ghost" data-close>Cancel</button>'}<button class="btn" type="submit">${note ? 'Save' : 'Share'}</button></div>`,
  async (el) => {
    const body = el.querySelector('#n-body').value.trim();
    if (!body) return false;
    const quote_id = el.querySelector('.pick.on')?.dataset.pick || null;
    const { error } = note ? await sb.from('dl_insights').update({ body, quote_id }).eq('id', note.id) : await sb.from('dl_insights').insert({ body, quote_id, author: S.person });
    if (error) throw error;
    await loadInsights(); toast(note ? 'Saved' : 'Shared with ' + otherName());
    if (S.route !== 'insights') location.hash = '#/insights'; else render();
  });
  el.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) { el.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === p)); }
    if (e.target.closest('[data-del]') && confirm('Delete this insight?')) {
      const { error } = await sb.from('dl_insights').delete().eq('id', note.id);
      if (error) return toast(error.message);
      el.remove(); await loadInsights(); render(); toast('Deleted');
    }
  });
}
function bookSheet() {
  sheet(h`<h2>Add a book</h2><label class="f" for="b-t">Title</label><input id="b-t" required maxlength="200"><label class="f" for="b-a">Author</label><input id="b-a" required maxlength="200">
    <div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Add</button></div>`,
  async (el) => {
    const { data, error } = await sb.from('dl_books').insert({ title: el.querySelector('#b-t').value.trim(), author: el.querySelector('#b-a').value.trim(), added_by: S.person }).select().single();
    if (error) throw error;
    await loadBooks(); location.hash = '#/book/' + data.id; toast('Book added');
  });
}
function quoteSheet(bookId) {
  const b = S.books.find((x) => x.id === bookId);
  sheet(h`<h2>Add a quote</h2><p class="muted small">From <em>${esc(b.title)}</em>. Please copy it word for word and keep it short (1–2 sentences).</p>
    <textarea class="serif" id="q-b" maxlength="600" required placeholder="Exact words from the book"></textarea>
    <label class="f" for="q-c">Chapter or page (optional)</label><input id="q-c" maxlength="200" placeholder="e.g. Chapter 3 or p. 42">
    <div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Add</button></div>`,
  async (el) => {
    const body = el.querySelector('#q-b').value.trim().replace(/^["“]|["”]$/g, '');
    const { error } = await sb.from('dl_quotes').insert({ kind: 'book', book_id: bookId, body, chapter: el.querySelector('#q-c').value.trim() || null, added_by: S.person });
    if (error) throw error;
    await loadBooks(); render(); toast('Added to the rotation');
  });
}

// ---------- push ----------
const b64urlToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function swReg() { if (!('serviceWorker' in navigator)) return null; return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('sw.js'); }
async function deviceSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await swReg();
  return reg ? await reg.pushManager.getSubscription() : null;
}
async function refreshPushState() {
  const el = document.getElementById('push-state');
  const warn = document.getElementById('push-warn');
  const actions = document.getElementById('push-actions');
  if (!el || !actions) return;
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window;
  if (!pushOk) { actions.innerHTML = ''; if (warn) warn.hidden = true; return; }
  try {
    const sub = await deviceSubscription();
    const schedOn = !!S.me?.notify_enabled;
    const timeLabel = fmtTime(String(S.me?.notify_time || '07:00').slice(0, 5));
    if (Notification.permission === 'denied') {
      el.textContent = 'Notifications are blocked for Daily Light. Turn them on in your phone’s Settings → Notifications → Daily Light.';
      if (warn) { warn.hidden = true; warn.textContent = ''; }
      actions.innerHTML = '';
      return;
    }
    if (sub) {
      el.textContent = `Morning notifications are on for this phone · ${timeLabel}.`;
      if (warn) { warn.hidden = true; warn.textContent = ''; }
      actions.innerHTML = '<div class="row"><button class="btn ghost" data-act="pushoff">Turn off on this phone</button><button class="btn ghost" data-act="pushtest">Send a test</button></div>';
      return;
    }
    if (schedOn) {
      el.textContent = `Your morning time is set for ${timeLabel}, but this phone isn’t registered to receive it.`;
      if (warn) {
        warn.hidden = false;
        warn.textContent = 'Morning notifications need this phone registered. Tap the button below, then Allow when prompted.';
      }
      actions.innerHTML = '<button class="btn block" data-act="pushon" id="push-btn">Register this phone</button>';
      return;
    }
    el.textContent = 'Morning notifications are off on this phone.';
    if (warn) { warn.hidden = true; warn.textContent = ''; }
    actions.innerHTML = '<button class="btn block" data-act="pushon" id="push-btn">Turn on morning notifications</button>';
  } catch {
    el.textContent = 'Couldn’t check notifications here.';
    if (warn) { warn.hidden = true; warn.textContent = ''; }
    actions.innerHTML = '';
  }
}
async function pushOn() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications weren’t allowed'); return refreshPushState(); }
  const reg = await swReg(); await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON();
  const { error } = await sb.rpc('dl_save_subscription', { p_person: S.person, p_endpoint: j.endpoint, p_keys: j.keys, p_user_agent: navigator.userAgent.slice(0, 300) });
  if (error) throw error;
  // Also persist the time/tz the user may have adjusted before registering
  const timeEl = document.getElementById('s-time'), tzEl = document.getElementById('s-tz');
  if (timeEl && tzEl) {
    const patch = { notify_time: timeEl.value || '07:00', tz: tzEl.value };
    await sb.from('dl_people').update(patch).eq('person', S.person);
  }
  await loadMembers();
  toast('Morning notifications on ☀️');
  render();
}
async function pushOff() {
  const reg = await swReg(); const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await sb.rpc('dl_remove_subscription', { p_endpoint: sub.endpoint }); try { await sub.unsubscribe(); } catch {} }
  await loadMembers();
  toast('Notifications off for this phone');
  render();
}
async function pushTest() {
  const sub = await deviceSubscription();
  if (!sub) return toast('Register this phone for notifications first');
  const { data, error } = await sb.functions.invoke(PUSH_FUNCTION, { body: { action: 'test', endpoint: sub.endpoint } });
  if (error) { let m = 'Register this phone first'; try { m = (await error.context.json()).error || m; } catch {} return toast(m); }
  toast(data.sent ? 'Test sent — check your notifications' : 'Couldn’t deliver the test');
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-go],[data-book],[data-fav],[data-theme-set],[data-person]');
  if (!t || t.closest('.sheet')) return;
  try {
    if (t.dataset.person) { setPerson(t.dataset.person); return; }
    if (t.dataset.go) { location.hash = '#/' + t.dataset.go; return; }
    if (t.dataset.fav) { S.favFilter = t.dataset.fav; render(); return; }
    if (t.dataset.themeSet) { localStorage.setItem('dl-theme', t.dataset.themeSet); applyTheme(); render(); return; }
    const a = t.dataset.act;
    if (!a && t.dataset.book) { location.hash = '#/book/' + t.dataset.book; return; }
    if (a === 'heart') {
      const qid = t.dataset.qid, mine = S.favs.some((f) => f.quote_id === qid && f.person === S.person);
      if (mine) { S.favs = S.favs.filter((f) => !(f.quote_id === qid && f.person === S.person)); }
      else { S.favs.unshift({ quote_id: qid, person: S.person, created_at: new Date().toISOString() }); }
      render();
      if (!mine) document.querySelectorAll(`[data-act=heart][data-qid="${qid}"]`).forEach((b) => b.classList.add('pop'));
      const { error } = mine ? await sb.from('dl_favorites').delete().eq('quote_id', qid).eq('person', S.person) : await sb.from('dl_favorites').insert({ quote_id: qid, person: S.person });
      if (error && error.code !== '23505') { toast('Couldn’t save that. Try again.'); await loadFavs(); render(); }
      return;
    }
    if (a === 'insight') return noteSheet(null, t.dataset.qid);
    if (a === 'newnote') return noteSheet();
    if (a === 'editnote') return noteSheet(S.insights.find((n) => n.id === t.dataset.id));
    if (a === 'share') { const q = S.quotes.get(t.dataset.qid); const src = q.kind === 'scripture' ? q.citation : q.kind === 'conference' ? `${q.speaker}, “${q.talk_title}” ${q.url}` : `${bookOf(q)?.title}, ${bookOf(q)?.author}`; try { await navigator.share({ text: `“${q.body}” — ${src}` }); } catch {} return; }
    if (a === 'prevday') { await loadToday(addDays(S.day, -1)); return render(); }
    if (a === 'nextday') { await loadToday(addDays(S.day, 1)); return render(); }
    if (a === 'today') { await loadToday(localDay()); return render(); }
    if (a === 'addbook') return bookSheet();
    if (a === 'addquote') return quoteSheet(t.dataset.book);
    if (a === 'delquote') { if (!confirm('Delete this quote?')) return; const { error } = await sb.from('dl_quotes').delete().eq('id', t.dataset.qid); if (error) throw error; await loadBooks(); render(); return toast('Deleted'); }
    if (a === 'delbook') { if (!confirm('Delete this book and its quotes?')) return; const { error } = await sb.from('dl_books').delete().eq('id', t.dataset.book); if (error) throw error; await loadBooks(); location.hash = '#/shelf'; return toast('Book deleted'); }
    if (a === 'savenotify') {
      const patch = { notify_time: document.getElementById('s-time').value || '07:00', tz: document.getElementById('s-tz').value };
      const { error } = await sb.from('dl_people').update(patch).eq('person', S.person); if (error) throw error;
      await loadMembers(); render(); return toast(`Morning time saved · ${fmtTime(patch.notify_time)}`);
    }
    if (a === 'savename') { const v = document.getElementById('s-name').value.trim(); if (!v) return; const { error } = await sb.from('dl_people').update({ display_name: v }).eq('person', S.person); if (error) throw error; await loadMembers(); render(); return toast('Saved'); }
    if (a === 'pushon') return await pushOn();
    if (a === 'pushoff') return await pushOff();
    if (a === 'pushtest') return await pushTest();
    if (a === 'switch') { if (!confirm(`Switch this device to ${otherName()}?`)) return; const reg = await swReg(); const sub = reg && (await reg.pushManager.getSubscription()); if (sub) { await sb.rpc('dl_remove_subscription', { p_endpoint: sub.endpoint }); try { await sub.unsubscribe(); } catch {} } setPerson(S.person === 'jacob' ? 'sophie' : 'jacob'); return; }
  } catch (err) { console.error(err); toast(err.message || 'Something went wrong'); }
});
const fmtTime = (hm) => { const [H, M] = hm.split(':').map(Number); return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; };
function applyTheme() { const t = localStorage.getItem('dl-theme') || 'auto'; document.documentElement.dataset.theme = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- routing + realtime ----------
async function route() {
  const [, r, id] = (location.hash || '#/today').match(/^#\/([a-z]+)(?:\/([\w-]+))?/) || [, 'today'];
  S.route = r || 'today'; S.bookId = id || null;
  if (S.me) {
    if (S.route === 'insights') await loadInsights().catch(() => {});
    if (S.route === 'favorites') await loadFavs().catch(() => {});
  }
  render(); window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

let channel, refreshT;
function realtime() {
  if (channel) sb.removeChannel(channel);
  const refetch = (what) => { clearTimeout(refreshT); refreshT = setTimeout(async () => {
    try {
      if (what === 'dl_insights') await loadInsights();
      else if (what === 'dl_favorites') await loadFavs();
      else if (what === 'dl_people') await loadMembers();
      else { await loadBooks(); await loadToday(S.day); }
      if (!document.querySelector('.scrim')) render();
    } catch {}
  }, 250); };
  channel = sb.channel('dl-live');
  for (const t of ['dl_insights', 'dl_favorites', 'dl_quotes', 'dl_books', 'dl_people']) channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => refetch(t));
  channel.subscribe();
}
async function boot() {
  try {
    await loadMembers();
    if (!S.me) return render();
    await Promise.all([loadBooks(), loadFavs(), loadInsights()]);
    await loadToday(localDay());
    realtime();
  } catch (e) { console.error(e); toast('Couldn’t load. Pull down to retry.'); }
  route();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && S.me) { if (S.day !== localDay() && S.route === 'today') S.day = localDay(); await Promise.all([loadToday(S.day), loadFavs(), loadInsights()]).catch(() => {}); if (!document.querySelector('.scrim')) render(); }
});
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open') location.href = e.data.url; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

function setPerson(p) {
  localStorage.setItem('dl-person', p); S.person = p; S.me = null; S.favFilter = 'all';
  if (location.hash !== '#/today') location.hash = '#/today';
  boot();
}
if (S.person) boot(); else render();
