-- Growth loop: native-app waitlist with referral priority + in-app invite attribution.
--
-- Privacy invariants (this is a cruising app; membership itself is sensitive):
--   * No client can read waitlist rows or emails. All access goes through RPCs.
--   * join_waitlist never confirms whether an email is already on the list
--     with anything beyond a generic status, and never returns another person's code.
--   * Who-invited-whom lives in profile_referrals, which has no read policy.

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.gen_ref_code()
returns text
language sql
volatile
as $$ select substr(md5(gen_random_uuid()::text), 1, 8) $$;

-- ─── Waitlist ───────────────────────────────────────────────────────────────
alter table public.waitlist
  add column if not exists city        text,
  add column if not exists platform    text not null default 'either',
  add column if not exists ref_code    text not null default public.gen_ref_code(),
  add column if not exists referred_by text;

do $$ begin
  alter table public.waitlist add constraint waitlist_ref_code_key unique (ref_code);
exception when duplicate_object or duplicate_table then null; end $$;

do $$ begin
  alter table public.waitlist add constraint waitlist_platform_check check (platform in ('ios', 'android', 'either'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.waitlist add constraint waitlist_referred_by_fkey
    foreign key (referred_by) references public.waitlist (ref_code) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by);
create index if not exists waitlist_city_idx on public.waitlist (lower(city));

-- Direct inserts bypass validation; everything goes through join_waitlist now.
drop policy if exists allow_anon_insert on public.waitlist;

-- Invites needed to jump the line
create or replace function public.waitlist_status(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select w.ref_code,
           w.created_at,
           (select count(*) from waitlist r where r.referred_by = w.ref_code) as referrals
    from waitlist w
  ), ranked as (
    select ref_code, referrals,
           row_number() over (order by (referrals >= 3) desc, created_at asc) as position
    from scored
  )
  select jsonb_build_object(
           'code', r.ref_code,
           'position', r.position,
           'total', (select count(*) from waitlist),
           'referrals', r.referrals,
           'priority', r.referrals >= 3,
           'needed', greatest(0, 3 - r.referrals)
         )
  from ranked r
  where r.ref_code = p_code;
$$;

create or replace function public.join_waitlist(
  p_email    text,
  p_city     text default null,
  p_platform text default 'either',
  p_ref      text default null,
  p_source   text default 'landing'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email    text := lower(trim(p_email));
  v_city     text := nullif(left(trim(coalesce(p_city, '')), 80), '');
  v_platform text := case when p_platform in ('ios', 'android') then p_platform else 'either' end;
  v_source   text := coalesce(nullif(left(regexp_replace(coalesce(p_source, ''), '[^a-zA-Z0-9_.-]', '', 'g'), 64), ''), 'landing');
  v_ref      text := (select ref_code from waitlist where ref_code = lower(trim(coalesce(p_ref, ''))));
  v_code     text;
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  insert into waitlist (email, city, platform, referred_by, source)
  values (v_email, v_city, v_platform, v_ref, v_source)
  on conflict (email) do nothing
  returning ref_code into v_code;

  -- Already listed: generic answer only. Never leak the existing row's code or position.
  if v_code is null then
    return jsonb_build_object('status', 'exists');
  end if;

  return jsonb_build_object('status', 'joined') || public.waitlist_status(v_code);
end;
$$;

-- City demand for picking launch zones (admin only)
create or replace function public.waitlist_demand()
returns table (city text, signups bigint, ios bigint, android bigint, last_7d bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(initcap(lower(w.city)), '(none)') as city,
         count(*)                                                as signups,
         count(*) filter (where w.platform = 'ios')              as ios,
         count(*) filter (where w.platform = 'android')          as android,
         count(*) filter (where w.created_at > now() - interval '7 days') as last_7d
  from waitlist w
  where public.is_admin()
  group by 1
  order by signups desc;
$$;

-- ─── In-app invites ─────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists ref_code text default public.gen_ref_code();

update public.profiles set ref_code = public.gen_ref_code() where ref_code is null;
alter table public.profiles alter column ref_code set not null;

do $$ begin
  alter table public.profiles add constraint profiles_ref_code_key unique (ref_code);
exception when duplicate_object or duplicate_table then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_ref_code_format check (ref_code ~ '^[a-z0-9_-]{4,24}$');
exception when duplicate_object then null; end $$;

create table if not exists public.profile_referrals (
  referee    uuid primary key references public.profiles (id) on delete cascade,
  referrer   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_referrals_not_self check (referee <> referrer)
);
create index if not exists profile_referrals_referrer_idx on public.profile_referrals (referrer);

-- RLS on, zero policies: unreadable/unwritable except through the RPCs below.
alter table public.profile_referrals enable row level security;

-- Attribute the caller to an inviter. Only new profiles (< 24h) can be attributed, once.
create or replace function public.claim_referral(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_referrer uuid;
begin
  if v_me is null then return false; end if;

  select id into v_referrer from profiles where ref_code = lower(trim(coalesce(p_code, '')));
  if v_referrer is null or v_referrer = v_me then return false; end if;

  if not exists (select 1 from profiles where id = v_me and created_at > now() - interval '24 hours') then
    return false;
  end if;

  insert into profile_referrals (referee, referrer) values (v_me, v_referrer)
  on conflict (referee) do nothing;
  return found;
end;
$$;

create or replace function public.my_invite_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'code', p.ref_code,
           'invited', (select count(*) from profile_referrals r where r.referrer = p.id)
         )
  from profiles p
  where p.id = auth.uid();
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.gen_ref_code()                              from public, anon, authenticated;
revoke all on function public.waitlist_status(text)                       from public;
revoke all on function public.join_waitlist(text, text, text, text, text) from public;
revoke all on function public.waitlist_demand()                           from public, anon;
revoke all on function public.claim_referral(text)                        from public, anon;
revoke all on function public.my_invite_stats()                           from public, anon;

grant execute on function public.waitlist_status(text)                       to anon, authenticated;
grant execute on function public.join_waitlist(text, text, text, text, text) to anon, authenticated;
grant execute on function public.waitlist_demand()                           to authenticated;
grant execute on function public.claim_referral(text)                        to authenticated;
grant execute on function public.my_invite_stats()                           to authenticated;
