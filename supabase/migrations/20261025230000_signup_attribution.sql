-- Paid acquisition: which ad produced each signup.
--
-- Privacy invariants (membership in a cruising app is sensitive):
--   * One row per profile, written only through record_signup_attribution(). No client read policy.
--   * Reporting is aggregate-only and admin-only (acquisition_report). No per-person export.
--   * Rows cascade-delete with the profile.

create table if not exists public.signup_attribution (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  source     text not null,
  medium     text,
  campaign   text,
  content    text,
  click_id   text,
  landed_at  timestamptz,
  created_at timestamptz not null default now(),
  constraint signup_attribution_source_format check (source ~ '^[a-zA-Z0-9_.-]{1,64}$')
);
create index if not exists signup_attribution_created_idx on public.signup_attribution (created_at desc);
create index if not exists signup_attribution_source_idx on public.signup_attribution (source, campaign, content);

-- RLS on, zero policies: unreadable/unwritable except through the functions below.
alter table public.signup_attribution enable row level security;

create or replace function public.record_signup_attribution(
  p_source    text,
  p_medium    text default null,
  p_campaign  text default null,
  p_content   text default null,
  p_click_id  text default null,
  p_landed_at timestamptz default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_source text := left(regexp_replace(coalesce(p_source, ''), '[^a-zA-Z0-9_.-]', '', 'g'), 64);
begin
  if v_me is null or v_source = '' then return false; end if;

  -- Only brand-new profiles can be attributed, so an ad click can't claim an existing member.
  if not exists (select 1 from profiles where id = v_me and created_at > now() - interval '24 hours') then
    return false;
  end if;

  insert into signup_attribution (profile_id, source, medium, campaign, content, click_id, landed_at)
  values (
    v_me,
    v_source,
    nullif(left(regexp_replace(coalesce(p_medium, ''),   '[^a-zA-Z0-9_.-]', '', 'g'), 64), ''),
    nullif(left(regexp_replace(coalesce(p_campaign, ''), '[^a-zA-Z0-9_.-]', '', 'g'), 64), ''),
    nullif(left(regexp_replace(coalesce(p_content, ''),  '[^a-zA-Z0-9_.-]', '', 'g'), 64), ''),
    nullif(left(regexp_replace(coalesce(p_click_id, ''), '[^a-zA-Z0-9_.-]', '', 'g'), 128), ''),
    case when p_landed_at between now() - interval '31 days' and now() + interval '5 minutes' then p_landed_at end
  )
  on conflict (profile_id) do nothing;
  return found;
end;
$$;

-- Signups and next-day return by ad. "returned" = seen again 24h+ after signing up.
create or replace function public.acquisition_report(p_days int default 30)
returns table (
  source   text,
  medium   text,
  campaign text,
  content  text,
  signups  bigint,
  returned bigint,
  last_7d  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select a.source, a.medium, a.campaign, a.content,
         count(*)                                                                     as signups,
         count(*) filter (where p.last_seen > a.created_at + interval '24 hours')    as returned,
         count(*) filter (where a.created_at > now() - interval '7 days')            as last_7d
  from signup_attribution a
  join profiles p on p.id = a.profile_id
  where public.is_admin()
    and a.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  group by 1, 2, 3, 4
  order by signups desc;
$$;

revoke all on function public.record_signup_attribution(text, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.acquisition_report(int)                                              from public, anon;
grant execute on function public.record_signup_attribution(text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.acquisition_report(int)                                              to authenticated;
