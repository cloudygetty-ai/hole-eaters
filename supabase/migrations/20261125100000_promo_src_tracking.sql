-- Promo source tracking: which poster, sticker, card or ad brought people in.
-- Links carry ?src=<tag> (poster, sticker, card, ad-300x250 …) or ?utm_source=<tag>.
--   promo_visits: one row per visitor (random id kept in their browser), tag and day. No account, IP or location.
--   profiles.signup_src: the tag a new member arrived with, set once in their first 24 hours.
--   promo_stats(): visitors and sign-ups per tag, admins only.

alter table public.profiles add column if not exists signup_src text;

create table if not exists public.promo_visits (
  day date not null default current_date,
  src text not null check (src ~ '^[a-z0-9_.-]{1,40}$'),
  visitor uuid not null,
  created_at timestamptz not null default now(),
  primary key (day, src, visitor)
);
alter table public.promo_visits enable row level security; -- no policies: written and read only through the functions below

create or replace function public.log_promo_visit(p_src text, p_visitor uuid) returns void
language sql security definer set search_path = public as $$
  insert into promo_visits (src, visitor)
  select lower(p_src), p_visitor
  where p_src ~* '^[a-z0-9_.-]{1,40}$' and p_visitor is not null
  on conflict do nothing
$$;

create or replace function public.claim_signup_source(p_src text) returns void
language sql security definer set search_path = public as $$
  update profiles set signup_src = lower(p_src)
  where id = auth.uid() and signup_src is null
    and p_src ~* '^[a-z0-9_.-]{1,40}$'
    and created_at > now() - interval '24 hours'
$$;

create or replace function public.promo_stats(days integer default 90)
returns table (src text, visitors bigint, signups bigint)
language sql stable security definer set search_path = public as $$
  with v as (select p.src, count(distinct p.visitor) as n from promo_visits p
             where p.day > current_date - least(greatest(coalesce(days, 90), 1), 365) group by p.src),
       s as (select pr.signup_src as src, count(*) as n from profiles pr
             where pr.signup_src is not null and pr.created_at > now() - make_interval(days => least(greatest(coalesce(days, 90), 1), 365))
             group by pr.signup_src)
  select coalesce(v.src, s.src), coalesce(v.n, 0), coalesce(s.n, 0)
  from v full join s on s.src = v.src
  where public.is_admin()
  order by 2 desc, 3 desc, 1
$$;

revoke execute on function public.log_promo_visit(text, uuid), public.claim_signup_source(text), public.promo_stats(integer) from public;
grant execute on function public.log_promo_visit(text, uuid) to anon, authenticated;
grant execute on function public.claim_signup_source(text), public.promo_stats(integer) to authenticated;
