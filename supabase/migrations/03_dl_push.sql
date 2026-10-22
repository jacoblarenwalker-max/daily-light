-- Daily Light: morning Web Push at each person's chosen time (free: pg_cron + pg_net + Vault + one Edge Function).
create table if not exists public.dl_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  keys jsonb not null check (jsonb_typeof(keys) = 'object' and keys ? 'p256dh' and keys ? 'auth'),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists dl_push_subscriptions_user_idx on public.dl_push_subscriptions (user_id);
alter table public.dl_push_subscriptions enable row level security;
revoke all on public.dl_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.dl_push_subscriptions to authenticated;
create policy dl_push_select on public.dl_push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy dl_push_insert on public.dl_push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.dl_is_member()));
create policy dl_push_update on public.dl_push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.dl_is_member()));
create policy dl_push_delete on public.dl_push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- one morning message per person per local day (de-dupe + log); no client access
create table if not exists public.dl_morning_sends (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_day date not null,
  title text not null,
  body text not null,
  dry_run boolean not null default false,
  request_id bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, local_day)
);
alter table public.dl_morning_sends enable row level security;
revoke all on public.dl_morning_sends from anon, authenticated;

-- every 5 min: anyone whose local time has reached their notify_time today (within a 3h window) and who
-- hasn't been sent today gets one push with the start of today's verse.
create or replace function private.dl_send_morning(p_now timestamptz default now(), p_mode text default 'send')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m record; v_local timestamp; v_day date; v_verse public.dl_quotes; v_title text; v_body text;
  v_secret text; v_req bigint; v_out jsonb := '[]'::jsonb;
begin
  if p_mode not in ('send', 'plan', 'dry_run') then raise exception 'bad mode %', p_mode; end if;
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'dl_push_webhook_secret' limit 1;
  for m in select * from public.dl_members where notify_enabled loop
    v_local := p_now at time zone m.tz;
    v_day := v_local::date;
    if v_local::time < m.notify_time or v_local::time > m.notify_time + interval '3 hours' then continue; end if;
    if exists (select 1 from public.dl_morning_sends s where s.user_id = m.user_id and s.local_day = v_day) then continue; end if;
    if p_mode <> 'plan' and not exists (select 1 from public.dl_push_subscriptions s where s.user_id = m.user_id) then continue; end if;
    select q.* into v_verse from public.dl_today(v_day) q where q.kind = 'scripture';
    v_title := 'Good morning, ' || m.display_name || ' ☀️';
    v_body := coalesce(v_verse.citation || ': ', '') ||
              case when length(v_verse.body) > 140 then left(v_verse.body, 137) || '…' else coalesce(v_verse.body, 'Your Daily Light is ready.') end;
    if p_mode = 'plan' then
      v_out := v_out || jsonb_build_object('user', m.display_name, 'day', v_day, 'title', v_title, 'body', v_body);
      continue;
    end if;
    if v_secret is null then return jsonb_build_object('skipped', 'dl_push_webhook_secret missing'); end if;
    insert into public.dl_morning_sends (user_id, local_day, title, body, dry_run)
    values (m.user_id, v_day, v_title, v_body, p_mode = 'dry_run') on conflict do nothing;
    if not found then continue; end if;
    select net.http_post(
      url := 'https://voydoxmxdnjnewxlwzse.supabase.co/functions/v1/dl-push',
      body := jsonb_build_object('action', 'morning', 'user_id', m.user_id, 'local_day', v_day),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dl-secret', v_secret),
      timeout_milliseconds := 10000) into v_req;
    update public.dl_morning_sends set request_id = v_req where user_id = m.user_id and local_day = v_day;
    update public.dl_members set last_notified_on = v_day where user_id = m.user_id;
    v_out := v_out || jsonb_build_object('user', m.display_name, 'request_id', v_req);
  end loop;
  return jsonb_build_object('mode', p_mode, 'results', v_out);
end $$;
revoke all on function private.dl_send_morning(timestamptz, text) from public, anon, authenticated;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dl_push_webhook_secret',
                           'Daily Light: x-dl-secret header for the dl-push Edge Function')
where not exists (select 1 from vault.secrets where name = 'dl_push_webhook_secret');

select cron.unschedule(jobid) from cron.job where jobname = 'dl-morning';
select cron.schedule('dl-morning', '*/5 * * * *', $$select private.dl_send_morning();$$);
