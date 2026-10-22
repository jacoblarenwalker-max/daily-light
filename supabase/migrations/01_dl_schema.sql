-- Daily Light: private inspiration app for Jacob + Sophie. Lives in the household-meals Supabase project
-- (the free plan's 2-project limit is reached). Purely additive: every object is prefixed dl_ / dl-.
-- Access: only the two people in public.dl_members (seeded by email) can read or write anything.

create table if not exists public.dl_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null check (length(display_name) between 1 and 40),
  notify_enabled boolean not null default true,
  notify_time time not null default '07:00',
  tz text not null default 'America/Denver' check (length(tz) <= 60),
  last_notified_on date,
  created_at timestamptz not null default now()
);
alter table public.dl_members enable row level security;
revoke all on public.dl_members from anon, authenticated;
grant select on public.dl_members to authenticated;
grant update (display_name, notify_enabled, notify_time, tz) on public.dl_members to authenticated;

insert into public.dl_members (user_id, email, display_name)
select u.id, lower(u.email), v.name
from auth.users u
join (values ('jacoblarenwalker@gmail.com', 'Jacob'), ('sophiegracest@gmail.com', 'Sophie')) v(email, name)
  on lower(u.email) = v.email
on conflict (user_id) do nothing;

create or replace function private.dl_is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dl_members m where m.user_id = (select auth.uid()));
$$;
revoke all on function private.dl_is_member() from public, anon;
grant execute on function private.dl_is_member() to authenticated;

drop policy if exists dl_members_select on public.dl_members;
create policy dl_members_select on public.dl_members for select to authenticated using ((select private.dl_is_member()));
drop policy if exists dl_members_update on public.dl_members;
create policy dl_members_update on public.dl_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function private.dl_valid_tz(p text) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p);
$$;
create or replace function private.dl_members_check() returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.dl_valid_tz(new.tz) then raise exception 'unknown time zone %', new.tz; end if;
  return new;
end $$;
drop trigger if exists dl_members_check on public.dl_members;
create trigger dl_members_check before insert or update on public.dl_members for each row execute function private.dl_members_check();

-- books + quotes ------------------------------------------------------------------------------------
create table if not exists public.dl_books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  author text not null check (length(author) between 1 and 200),
  seeded boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.dl_quotes (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  kind text not null check (kind in ('scripture', 'conference', 'book')),
  body text not null check (length(body) between 1 and 1200),
  citation text check (citation is null or length(citation) <= 200),     -- scripture reference
  speaker text check (speaker is null or length(speaker) <= 200),
  speaker_role text check (speaker_role is null or length(speaker_role) <= 200),
  talk_title text check (talk_title is null or length(talk_title) <= 300),
  url text check (url is null or url ~ '^https://'),
  conference text check (conference is null or length(conference) <= 60),
  book_id uuid references public.dl_books(id) on delete cascade,
  chapter text check (chapter is null or length(chapter) <= 200),
  source_note text check (source_note is null or length(source_note) <= 300),
  seeded boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'book' or book_id is not null)
);
create index if not exists dl_quotes_kind_seq on public.dl_quotes (kind, seq);
create index if not exists dl_quotes_book on public.dl_quotes (book_id);

create table if not exists public.dl_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quote_id uuid not null references public.dl_quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, quote_id)
);

create table if not exists public.dl_insights (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(body) between 1 and 4000),
  quote_id uuid references public.dl_quotes(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dl_insights_created on public.dl_insights (created_at desc);

-- RLS: members only; rows are shared, but you can only change/delete what you added (seeded rows are read-only)
do $$
declare t text;
begin
  foreach t in array array['dl_books', 'dl_quotes', 'dl_favorites', 'dl_insights'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.dl_is_member()))', t || '_select', t);
  end loop;
end $$;

create policy dl_books_insert on public.dl_books for insert to authenticated
  with check ((select private.dl_is_member()) and created_by = (select auth.uid()) and not seeded);
create policy dl_books_update on public.dl_books for update to authenticated
  using ((select private.dl_is_member()) and created_by = (select auth.uid()) and not seeded)
  with check (created_by = (select auth.uid()) and not seeded);
create policy dl_books_delete on public.dl_books for delete to authenticated
  using ((select private.dl_is_member()) and created_by = (select auth.uid()) and not seeded);

create policy dl_quotes_insert on public.dl_quotes for insert to authenticated
  with check ((select private.dl_is_member()) and created_by = (select auth.uid()) and not seeded and kind = 'book');
create policy dl_quotes_update on public.dl_quotes for update to authenticated
  using ((select private.dl_is_member()) and created_by = (select auth.uid()) and not seeded)
  with check (created_by = (select auth.uid()) and not seeded and kind = 'book');
create policy dl_quotes_delete on public.dl_quotes for delete to authenticated
  using ((select private.dl_is_member()) and created_by = (select auth.uid()) and not seeded);

create policy dl_favorites_insert on public.dl_favorites for insert to authenticated
  with check ((select private.dl_is_member()) and user_id = (select auth.uid()));
create policy dl_favorites_delete on public.dl_favorites for delete to authenticated
  using (user_id = (select auth.uid()));
revoke update on public.dl_favorites from authenticated;

create policy dl_insights_insert on public.dl_insights for insert to authenticated
  with check ((select private.dl_is_member()) and created_by = (select auth.uid()));
create policy dl_insights_update on public.dl_insights for update to authenticated
  using ((select private.dl_is_member()) and created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy dl_insights_delete on public.dl_insights for delete to authenticated
  using ((select private.dl_is_member()) and created_by = (select auth.uid()));

create or replace function private.dl_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.created_by := old.created_by; new.created_at := old.created_at; return new; end $$;
drop trigger if exists dl_insights_touch on public.dl_insights;
create trigger dl_insights_touch before update on public.dl_insights for each row execute function private.dl_touch();

-- today's three quotes: same for both people. Each kind rotates through its pool in seq order, one per day,
-- so nothing repeats until that pool is used up (new quotes join the end of the cycle).
create or replace function public.dl_today(p_day date default ((now() at time zone 'America/Denver')::date))
returns setof public.dl_quotes language sql stable security invoker set search_path = '' as $$
  with pool as (
    select q.*, row_number() over (partition by q.kind order by q.seq) - 1 as rn,
           count(*) over (partition by q.kind) as n
    from public.dl_quotes q
  )
  select id, seq, kind, body, citation, speaker, speaker_role, talk_title, url, conference, book_id, chapter,
         source_note, seeded, created_by, created_at
  from pool
  where rn = ((p_day - date '2026-10-22') % n + n) % n
  order by case kind when 'scripture' then 1 when 'conference' then 2 else 3 end;
$$;
revoke all on function public.dl_today(date) from public, anon;
grant execute on function public.dl_today(date) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['dl_members', 'dl_books', 'dl_quotes', 'dl_favorites', 'dl_insights'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.dl_favorites replica identity full;
