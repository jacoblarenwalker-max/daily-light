-- Tie notify_enabled to real push subscriptions, and allow catch-up morning sends.

create or replace function public.dl_save_subscription(
  p_person text, p_endpoint text, p_keys jsonb, p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_person is null or p_person not in ('jacob', 'sophie') then
    raise exception 'invalid person';
  end if;
  if p_endpoint is null or length(p_endpoint) < 8 then
    raise exception 'invalid endpoint';
  end if;

  insert into public.dl_push_subscriptions (person, endpoint, keys, user_agent)
  values (p_person, p_endpoint, p_keys, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set person = excluded.person,
        keys = excluded.keys,
        user_agent = excluded.user_agent;

  update public.dl_people
     set notify_enabled = true
   where person = p_person;
end;
$$;

revoke all on function public.dl_save_subscription(text, text, jsonb, text) from public;
grant execute on function public.dl_save_subscription(text, text, jsonb, text) to anon, authenticated, service_role;

create or replace function public.dl_remove_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person text;
begin
  select person into v_person
    from public.dl_push_subscriptions
   where endpoint = p_endpoint;

  delete from public.dl_push_subscriptions where endpoint = p_endpoint;

  if v_person is not null
     and not exists (
       select 1 from public.dl_push_subscriptions s where s.person = v_person
     )
  then
    update public.dl_people
       set notify_enabled = false
     where person = v_person;
  end if;
end;
$$;

revoke all on function public.dl_remove_subscription(text) from public;
grant execute on function public.dl_remove_subscription(text) to anon, authenticated, service_role;

-- catch_up: same as send, but ignore the 3-hour morning window (still de-dupes per local day)
create or replace function private.dl_send_morning(
  p_now timestamp with time zone default now(),
  p_mode text default 'send'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record; v_local timestamp; v_day date; v_verse public.dl_quotes; v_title text; v_body text;
  v_secret text; v_req bigint; v_out jsonb := '[]'::jsonb;
begin
  if p_mode not in ('send', 'plan', 'dry_run', 'catch_up') then
    raise exception 'bad mode %', p_mode;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'dl_push_webhook_secret' limit 1;

  for m in select * from public.dl_people where notify_enabled loop
    v_local := p_now at time zone m.tz;
    v_day := v_local::date;

    if p_mode <> 'catch_up' then
      if v_local::time < m.notify_time or v_local::time > m.notify_time + interval '3 hours' then
        continue;
      end if;
    end if;

    if exists (
      select 1 from public.dl_morning_sends s
       where s.person = m.person and s.local_day = v_day
    ) then
      continue;
    end if;

    if p_mode <> 'plan' and not exists (
      select 1 from public.dl_push_subscriptions s where s.person = m.person
    ) then
      continue;
    end if;

    select q.* into v_verse from public.dl_today(v_day) q where q.kind = 'scripture';
    v_title := 'Good morning, ' || m.display_name || ' ☀️';
    v_body := coalesce(v_verse.citation || ': ', '') ||
              case when length(v_verse.body) > 140 then left(v_verse.body, 137) || '…'
                   else coalesce(v_verse.body, 'Your Daily Light is ready.') end;

    if p_mode = 'plan' then
      v_out := v_out || jsonb_build_object('person', m.person, 'day', v_day, 'title', v_title, 'body', v_body);
      continue;
    end if;

    if v_secret is null then
      return jsonb_build_object('skipped', 'dl_push_webhook_secret missing');
    end if;

    insert into public.dl_morning_sends (person, local_day, title, body, dry_run)
    values (m.person, v_day, v_title, v_body, p_mode = 'dry_run')
    on conflict do nothing;
    if not found then continue; end if;

    select net.http_post(
      url := 'https://voydoxmxdnjnewxlwzse.supabase.co/functions/v1/dl-push',
      body := jsonb_build_object('action', 'morning', 'person', m.person, 'local_day', v_day),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dl-secret', v_secret),
      timeout_milliseconds := 10000
    ) into v_req;

    update public.dl_morning_sends set request_id = v_req
     where person = m.person and local_day = v_day;
    update public.dl_people set last_notified_on = v_day where person = m.person;
    v_out := v_out || jsonb_build_object('person', m.person, 'request_id', v_req);
  end loop;

  return jsonb_build_object('mode', p_mode, 'results', v_out);
end;
$$;
