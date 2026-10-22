-- Daily Light without sign-in (Jacob's choice): the browser uses the anon role, and each device says who is reading
-- ('jacob' or 'sophie'). Anyone with the link can read and write Daily Light data. Only dl_ objects change.

-- 1) people (replaces dl_members; keeps the saved times)
create table if not exists public.dl_people (
  person text primary key check (person in ('jacob', 'sophie')),
  display_name text not null check (length(display_name) between 1 and 40),
  notify_enabled boolean not null default true,
  notify_time time not null default '07:00',
  tz text not null default 'America/Denver' check (length(tz) <= 60),
  last_notified_on date
);
insert into public.dl_people (person, display_name, notify_enabled, notify_time, tz, last_notified_on)
select v.person, coalesce(m.display_name, v.name), coalesce(m.notify_enabled, true), coalesce(m.notify_time, '07:00'),
       coalesce(m.tz, 'America/Denver'), m.last_notified_on
from (values ('jacob', 'Jacob', 'jacoblarenwalker@gmail.com'), ('sophie', 'Sophie', 'sophiegracest@gmail.com')) v(person, name, email)
left join public.dl_members m on m.email = v.email
on conflict (person) do nothing;
drop trigger if exists dl_people_check on public.dl_people;
create trigger dl_people_check before insert or update on public.dl_people for each row execute function private.dl_members_check();

-- 2) author columns
alter table public.dl_books add column if not exists added_by text check (added_by in ('jacob', 'sophie'));
alter table public.dl_quotes add column if not exists added_by text check (added_by in ('jacob', 'sophie'));
alter table public.dl_books alter column created_by drop default;
alter table public.dl_quotes alter column created_by drop default;

alter table public.dl_insights add column if not exists author text;
update public.dl_insights i set author = case when u.email = 'sophiegracest@gmail.com' then 'sophie' else 'jacob' end
  from auth.users u where u.id = i.created_by and i.author is null;
delete from public.dl_insights where author is null;
alter table public.dl_insights alter column author set not null;
alter table public.dl_insights drop constraint if exists dl_insights_author_check;
alter table public.dl_insights add constraint dl_insights_author_check check (author in ('jacob', 'sophie'));
drop policy if exists dl_insights_insert on public.dl_insights;
drop policy if exists dl_insights_update on public.dl_insights;
drop policy if exists dl_insights_delete on public.dl_insights;
alter table public.dl_insights drop column if exists created_by;
create or replace function private.dl_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.author := old.author; new.created_at := old.created_at; return new; end $$;

drop table if exists public.dl_favorites;
create table public.dl_favorites (
  person text not null check (person in ('jacob', 'sophie')),
  quote_id uuid not null references public.dl_quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person, quote_id)
);
alter table public.dl_favorites replica identity full;

drop table if exists public.dl_morning_sends;
create table public.dl_morning_sends (
  person text not null check (person in ('jacob', 'sophie')),
  local_day date not null,
  title text not null, body text not null,
  dry_run boolean not null default false,
  request_id bigint,
  created_at timestamptz not null default now(),
  primary key (person, local_day)
);
alter table public.dl_morning_sends enable row level security;
revoke all on public.dl_morning_sends from anon, authenticated;

drop table if exists public.dl_push_subscriptions;
create table public.dl_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('jacob', 'sophie')),
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  keys jsonb not null check (jsonb_typeof(keys) = 'object' and keys ? 'p256dh' and keys ? 'auth'),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
alter table public.dl_push_subscriptions enable row level security;
revoke all on public.dl_push_subscriptions from anon, authenticated;   -- only through the two functions below

-- 3) policies: drop the sign-in ones, allow anon with person values limited to jacob/sophie
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('dl_books', 'dl_quotes', 'dl_favorites', 'dl_insights') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.dl_people enable row level security;
alter table public.dl_books enable row level security;
alter table public.dl_quotes enable row level security;
alter table public.dl_favorites enable row level security;
alter table public.dl_insights enable row level security;
revoke all on public.dl_people, public.dl_books, public.dl_quotes, public.dl_favorites, public.dl_insights from anon, authenticated;

grant select on public.dl_people to anon;
grant update (display_name, notify_enabled, notify_time, tz) on public.dl_people to anon;
create policy dl_people_read on public.dl_people for select to anon using (true);
create policy dl_people_write on public.dl_people for update to anon using (true) with check (person in ('jacob', 'sophie'));

grant select, delete on public.dl_books to anon;
grant insert (title, author, added_by) on public.dl_books to anon;
create policy dl_books_read on public.dl_books for select to anon using (true);
create policy dl_books_add on public.dl_books for insert to anon with check (not seeded and added_by in ('jacob', 'sophie'));
create policy dl_books_del on public.dl_books for delete to anon using (not seeded);

grant select, delete on public.dl_quotes to anon;
grant insert (kind, body, book_id, chapter, added_by) on public.dl_quotes to anon;
create policy dl_quotes_read on public.dl_quotes for select to anon using (true);
create policy dl_quotes_add on public.dl_quotes for insert to anon
  with check (not seeded and kind = 'book' and added_by in ('jacob', 'sophie') and length(body) <= 600);
create policy dl_quotes_del on public.dl_quotes for delete to anon using (not seeded);

grant select, insert, delete on public.dl_favorites to anon;
create policy dl_fav_read on public.dl_favorites for select to anon using (true);
create policy dl_fav_add on public.dl_favorites for insert to anon with check (person in ('jacob', 'sophie'));
create policy dl_fav_del on public.dl_favorites for delete to anon using (true);

grant select, delete on public.dl_insights to anon;
grant insert (body, quote_id, author) on public.dl_insights to anon;
grant update (body, quote_id) on public.dl_insights to anon;
create policy dl_ins_read on public.dl_insights for select to anon using (true);
create policy dl_ins_add on public.dl_insights for insert to anon with check (author in ('jacob', 'sophie'));
create policy dl_ins_edit on public.dl_insights for update to anon using (true) with check (author in ('jacob', 'sophie'));
create policy dl_ins_del on public.dl_insights for delete to anon using (true);

grant execute on function public.dl_today(date) to anon;

-- 4) push subscriptions via functions (endpoints are never readable from the browser)
create or replace function public.dl_save_subscription(p_person text, p_endpoint text, p_keys jsonb, p_user_agent text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.dl_push_subscriptions (person, endpoint, keys, user_agent)
  values (p_person, p_endpoint, p_keys, left(p_user_agent, 300))
  on conflict (endpoint) do update set person = excluded.person, keys = excluded.keys, user_agent = excluded.user_agent;
$$;
create or replace function public.dl_remove_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.dl_push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function public.dl_save_subscription(text, text, jsonb, text), public.dl_remove_subscription(text) from public, authenticated;
grant execute on function public.dl_save_subscription(text, text, jsonb, text), public.dl_remove_subscription(text) to anon;

-- 5) morning sender keyed on person
drop function if exists private.dl_send_morning(timestamptz, text);
create or replace function private.dl_send_morning(p_now timestamptz default now(), p_mode text default 'send')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m record; v_local timestamp; v_day date; v_verse public.dl_quotes; v_title text; v_body text;
  v_secret text; v_req bigint; v_out jsonb := '[]'::jsonb;
begin
  if p_mode not in ('send', 'plan', 'dry_run') then raise exception 'bad mode %', p_mode; end if;
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'dl_push_webhook_secret' limit 1;
  for m in select * from public.dl_people where notify_enabled loop
    v_local := p_now at time zone m.tz;
    v_day := v_local::date;
    if v_local::time < m.notify_time or v_local::time > m.notify_time + interval '3 hours' then continue; end if;
    if exists (select 1 from public.dl_morning_sends s where s.person = m.person and s.local_day = v_day) then continue; end if;
    if p_mode <> 'plan' and not exists (select 1 from public.dl_push_subscriptions s where s.person = m.person) then continue; end if;
    select q.* into v_verse from public.dl_today(v_day) q where q.kind = 'scripture';
    v_title := 'Good morning, ' || m.display_name || ' ☀️';
    v_body := coalesce(v_verse.citation || ': ', '') ||
              case when length(v_verse.body) > 140 then left(v_verse.body, 137) || '…' else coalesce(v_verse.body, 'Your Daily Light is ready.') end;
    if p_mode = 'plan' then
      v_out := v_out || jsonb_build_object('person', m.person, 'day', v_day, 'title', v_title, 'body', v_body);
      continue;
    end if;
    if v_secret is null then return jsonb_build_object('skipped', 'dl_push_webhook_secret missing'); end if;
    insert into public.dl_morning_sends (person, local_day, title, body, dry_run)
    values (m.person, v_day, v_title, v_body, p_mode = 'dry_run') on conflict do nothing;
    if not found then continue; end if;
    select net.http_post(
      url := 'https://voydoxmxdnjnewxlwzse.supabase.co/functions/v1/dl-push',
      body := jsonb_build_object('action', 'morning', 'person', m.person, 'local_day', v_day),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dl-secret', v_secret),
      timeout_milliseconds := 10000) into v_req;
    update public.dl_morning_sends set request_id = v_req where person = m.person and local_day = v_day;
    update public.dl_people set last_notified_on = v_day where person = m.person;
    v_out := v_out || jsonb_build_object('person', m.person, 'request_id', v_req);
  end loop;
  return jsonb_build_object('mode', p_mode, 'results', v_out);
end $$;
revoke all on function private.dl_send_morning(timestamptz, text) from public, anon, authenticated;

-- 6) retire the sign-in allowlist
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dl_members') then
    alter publication supabase_realtime drop table public.dl_members;
  end if;
end $$;
drop table if exists public.dl_members;
drop function if exists private.dl_is_member();

do $$
declare t text;
begin
  foreach t in array array['dl_people', 'dl_books', 'dl_quotes', 'dl_favorites', 'dl_insights'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
