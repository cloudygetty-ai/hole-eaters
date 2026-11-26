-- Invite rewards: what someone gets when a person joins Hole Eaters from their link.
--   Spotlight: 24 hours at the top of the nearby list with a lit-up map pin, per person who joins.
--              Stacks, but never runs more than 7 days ahead.
--   Founding Eater: a permanent profile badge once 3 people have joined from their link.
-- Nothing here is paid or unlocks a paid feature.
--
-- Privacy (membership is sensitive; who-invited-whom stays in profile_referrals, unreadable):
--   * invite_perks has RLS on and no policies: RPC access only.
--   * Other people only ever see two booleans (spotlight, founder) for profiles already on their
--     screen, never times or counts, so a spotlight can't be lined up with a new member's join time.

create table if not exists public.invite_perks (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  spotlight_until timestamptz,
  founder_at      timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.invite_perks enable row level security;
revoke all on public.invite_perks from anon, authenticated;

-- Internal: called by claim_referral after a new attribution. Not callable by clients.
create or replace function public.grant_invite_perks(p_referrer uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into invite_perks as ip (profile_id, spotlight_until, founder_at)
  values (
    p_referrer,
    now() + interval '24 hours',
    case when (select count(*) from profile_referrals r where r.referrer = p_referrer) >= 3 then now() end
  )
  on conflict (profile_id) do update set
    spotlight_until = least(greatest(coalesce(ip.spotlight_until, now()), now()) + interval '24 hours', now() + interval '7 days'),
    founder_at      = coalesce(ip.founder_at, excluded.founder_at),
    updated_at      = now();
$$;

-- Same contract as 20261016200000_growth_waitlist_referrals.sql, plus the reward on success.
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
  if not found then return false; end if;

  perform public.grant_invite_perks(v_referrer);
  return true;
end;
$$;

-- The caller's own invite status: link code, joins, Spotlight end time, badge.
create or replace function public.my_invite_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'code', p.ref_code,
           'invited', (select count(*) from profile_referrals r where r.referrer = p.id),
           'spotlight_until', case when ip.spotlight_until > now() then ip.spotlight_until end,
           'founder', ip.founder_at is not null,
           'founder_goal', 3
         )
  from profiles p
  left join invite_perks ip on ip.profile_id = p.id
  where p.id = auth.uid();
$$;

-- Perks for profiles already on the caller's screen (max 300 ids). Ghosts and blocked pairs get nothing.
create or replace function public.invite_perks_for(p_ids uuid[])
returns table (id uuid, spotlight boolean, founder boolean)
language sql
stable
security definer
set search_path = public
as $$
  select ip.profile_id, coalesce(ip.spotlight_until > now(), false), ip.founder_at is not null
  from invite_perks ip
  join profiles p on p.id = ip.profile_id
  where ip.profile_id = any (p_ids[1:300])
    and (ip.spotlight_until > now() or ip.founder_at is not null)
    and not coalesce(p.ghost, false)
    and not public.blocked_with(ip.profile_id);
$$;

revoke all on function public.grant_invite_perks(uuid)  from public, anon, authenticated;
revoke all on function public.invite_perks_for(uuid[])  from public, anon;
grant execute on function public.invite_perks_for(uuid[]) to authenticated;
-- claim_referral / my_invite_stats keep their existing grants (authenticated only); create or replace preserves them.
