-- dl_today returns whole dl_quotes rows (robust to new columns)
create or replace function public.dl_today(p_day date default ((now() at time zone 'America/Denver')::date))
returns setof public.dl_quotes language sql stable security invoker set search_path = '' as $$
  with pool as (
    select q.id, q.kind, row_number() over (partition by q.kind order by q.seq) - 1 as rn, count(*) over (partition by q.kind) as n
    from public.dl_quotes q
  )
  select q.* from public.dl_quotes q join pool p on p.id = q.id
  where p.rn = ((p_day - date '2026-10-22') % p.n + p.n) % p.n
  order by case q.kind when 'scripture' then 1 when 'conference' then 2 else 3 end;
$$;
revoke all on function public.dl_today(date) from public, authenticated;
grant execute on function public.dl_today(date) to anon;
