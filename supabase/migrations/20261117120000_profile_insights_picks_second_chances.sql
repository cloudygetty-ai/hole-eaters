-- Profile Insights, Picked for you, Second chances.
--
-- Signals come only from who someone views, likes and starts chats with (last 90 days), never from
-- message content (chats are end-to-end encrypted). Insights are on by default; a member opts out with
-- privacy.hide_behavior_insights, which removes their behaviour from every function below.
-- All computation is server-side; clients only ever receive aggregates, a score and reason labels.

-- ── Opt-out key ─────────────────────────────────────────────────────────────────
create or replace function public.valid_privacy(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('hide_age', 'hide_distance', 'stealth', 'quiet_hours', 'video_off', 'blur_media',
                           'hide_response_insight', 'hide_from_community_insights', 'hide_from_age_insights', 'email_alerts',
                           'hide_behavior_insights')
          or jsonb_typeof(e.value) <> 'boolean')
$$;

-- ── Helpers (internal, not callable by clients) ────────────────────────────────
create or replace function public.role_cat(r text) returns text
language sql immutable set search_path = public as $$
  select case when r in ('Top', 'Power Top') then 'top'
              when r in ('Bottom', 'Power Bottom') then 'bottom'
              when r = 'Versatile' then 'vers'
              when r = 'Side' then 'side' end
$$;

-- Kinks, "into" and fetish tags from profiles.details; tolerates missing or malformed arrays
create or replace function public.detail_tags(d jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct t), '{}')
  from (select jsonb_array_elements_text(case when jsonb_typeof(d -> k) = 'array' then d -> k else '[]'::jsonb end) as t
        from unnest(array['kinks', 'into', 'fetishes']) k) x
$$;

-- How well two stated roles go together, 0..1 (fallback when there isn't enough behaviour yet)
create or replace function public.stated_role_fit(mine text, theirs text) returns numeric
language sql immutable set search_path = public as $$
  select case
    when mine is null or theirs is null then 0.5
    when mine = 'top' then case theirs when 'bottom' then 1 when 'vers' then 0.7 when 'side' then 0.2 else 0.1 end
    when mine = 'bottom' then case theirs when 'top' then 1 when 'vers' then 0.7 when 'side' then 0.2 else 0.1 end
    when mine = 'vers' then case theirs when 'vers' then 1 when 'side' then 0.3 else 0.7 end
    else case theirs when 'side' then 1 else 0.3 end end
$$;

create or replace function public.tag_fit(a text[], b text[]) returns numeric
language sql immutable set search_path = public as $$
  select case when cardinality(a) = 0 or cardinality(b) = 0 then null
              else least(1, (select count(*) from unnest(a) x where x = any(b))::numeric
                            / greatest(1, least(4, cardinality(a), cardinality(b)))) end
$$;

create or replace function public.age_fit(age int, avg_age numeric, sd numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when age is null or avg_age is null then null
              else greatest(0, 1 - abs(age - avg_age) / (2 * coalesce(nullif(sd, 0), 5) + 5)) end
$$;

-- Weighted outgoing interest: views 1, likes 3, chats they started 4; capped at 8 per person so one
-- fixation can't dominate. Opted-out members and anonymous profiles produce/receive nothing.
create or replace function public.engaged_with(who uuid)
returns table(uid uuid, w numeric) language sql stable security definer set search_path = public as $$
  with e as (
    select v.viewed_id as uid, 1::numeric as w from profile_views v
     where v.viewer_id = who and v.viewed_at > now() - interval '90 days'
    union all
    select l.to_user, 3 from likes l where l.from_user = who and l.created_at > now() - interval '90 days'
    union all
    select case when x.user_a = who then x.user_b else x.user_a end, 4
      from matches x
     where who in (x.user_a, x.user_b) and x.created_at > now() - interval '90 days'
       and (select m.sender_id from messages m where m.match_id = x.id order by m.created_at limit 1) = who
  )
  select e.uid, least(sum(e.w), 8)
  from e join profiles p on p.id = e.uid
  where e.uid <> who and not p.is_anon and not public.p(who, 'hide_behavior_insights')
  group by e.uid
$$;

-- Aggregate picture of `who`: role mix of the people they go for, tags those people share, their ages.
create or replace function public.behavior_profile(who uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with j as (
    select e.w, public.role_cat(p.role) as cat, p.age, public.detail_tags(p.details) as tags
    from public.engaged_with(who) e join profiles p on p.id = e.uid
  ),
  roles as (select cat, sum(w) as s from j where cat is not null group by cat),
  tags as (select t, count(*) as people, sum(j.w) as s from j, unnest(j.tags) t group by t)
  select jsonb_build_object(
    'people', (select count(*) from j),
    'interest', (select jsonb_object_agg(cat, round(s / nullif((select sum(s) from roles), 0), 3)) from roles),
    'tags', coalesce((select jsonb_agg(t order by s desc) from (select t, s from tags where people >= 2 order by s desc limit 8) z), '[]'),
    'age_avg', (select round(avg(age), 1) from j where age is not null),
    'age_sd', (select round(stddev_pop(age), 1) from j where age is not null))
$$;

revoke execute on function public.role_cat(text), public.detail_tags(jsonb), public.stated_role_fit(text, text),
  public.tag_fit(text[], text[]), public.age_fit(int, numeric, numeric), public.engaged_with(uuid),
  public.behavior_profile(uuid) from public, anon, authenticated;

-- ── Profile Insights: shown on someone's profile ────────────────────────────────
-- Bars are what they seem to be (the opposite of who they go for). Match compares the caller's own
-- stated role, tags and age with that behaviour. Needs 5+ people of activity; counts are banded.
create or replace function public.profile_insight(target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b jsonb; i jsonb; mine record;
  people int; my_cat text; their_tags text[];
  f_pos numeric; f_tag numeric; f_age numeric; score numeric; wsum numeric;
begin
  if me is null or target is null or target = me or public.i_am_banned() then return null; end if;
  if public.p(target, 'hide_behavior_insights') then return null; end if;
  if exists (select 1 from blocks k where (k.blocker = me and k.blocked = target) or (k.blocker = target and k.blocked = me)) then return null; end if;
  if not exists (select 1 from profiles where id = target and not is_anon) then return null; end if;

  b := public.behavior_profile(target);
  people := coalesce((b ->> 'people')::int, 0);
  i := b -> 'interest';
  if people < 5 or i is null then return jsonb_build_object('enough', false); end if;

  select role, age, details into mine from profiles where id = me;
  my_cat := public.role_cat(mine.role);
  select coalesce(array_agg(x), '{}') into their_tags from jsonb_array_elements_text(b -> 'tags') x;

  f_pos := case my_cat
    when 'top' then coalesce((i ->> 'top')::numeric, 0) + 0.5 * coalesce((i ->> 'vers')::numeric, 0)
    when 'bottom' then coalesce((i ->> 'bottom')::numeric, 0) + 0.5 * coalesce((i ->> 'vers')::numeric, 0)
    when 'vers' then coalesce((i ->> 'vers')::numeric, 0) + 0.5 * (coalesce((i ->> 'top')::numeric, 0) + coalesce((i ->> 'bottom')::numeric, 0))
    when 'side' then coalesce((i ->> 'side')::numeric, 0) + 0.25 * (1 - coalesce((i ->> 'side')::numeric, 0))
    else null end;
  f_pos := least(1, f_pos);
  f_tag := public.tag_fit(public.detail_tags(mine.details), their_tags);
  f_age := public.age_fit(mine.age, (b ->> 'age_avg')::numeric, (b ->> 'age_sd')::numeric);

  wsum := (case when f_pos is null then 0 else 0.5 end) + (case when f_tag is null then 0 else 0.3 end) + (case when f_age is null then 0 else 0.2 end);
  score := case when wsum = 0 then null
                else (coalesce(f_pos, 0) * 0.5 + coalesce(f_tag, 0) * 0.3 + coalesce(f_age, 0) * 0.2) / wsum end;

  return jsonb_build_object(
    'enough', true,
    'people', case when people >= 25 then '25+' when people >= 10 then '10+' else '5+' end,
    'bars', jsonb_build_object(
      'top', coalesce((i ->> 'bottom')::numeric, 0),
      'vers', coalesce((i ->> 'vers')::numeric, 0),
      'bottom', coalesce((i ->> 'top')::numeric, 0),
      'side', coalesce((i ->> 'side')::numeric, 0)),
    'into', to_jsonb(their_tags[1:5]),
    'match', case when score is null then null else round(score * 100)::int end,
    'reasons', to_jsonb(array_remove(array[
      case when f_pos >= 0.5 then 'Position' end,
      case when f_tag >= 0.5 then 'Kinks' end,
      case when f_age >= 0.6 then 'Age' end], null)));
end $$;

-- ── Picked for you: up to 12 nearby people, stable for the day ─────────────────
-- Uses the caller's own behaviour when there's enough (and they haven't opted out), otherwise their
-- stated role, tags and age. Skips people already liked, blocked, banned, hidden or anonymous.
create or replace function public.picked_for_you(lat double precision, lng double precision, radius_meters integer default 25000)
returns table(id uuid, score int, reasons text[])
language sql stable security definer set search_path to 'public', 'extensions' as $$
  with me as (
    select p.id, public.role_cat(p.role) as cat, p.age, public.detail_tags(p.details) as tags,
           public.behavior_profile(p.id) as b
    from profiles p where p.id = auth.uid() and not public.i_am_banned()
  ),
  pref as (
    select me.*,
           coalesce((me.b ->> 'people')::int, 0) >= 5 and me.b -> 'interest' is not null as has_b,
           (select coalesce(array_agg(distinct x), '{}') from (select unnest(me.tags) union all select jsonb_array_elements_text(me.b -> 'tags')) z(x)) as want_tags,
           (select max(v::numeric) from jsonb_each_text(me.b -> 'interest') e(k, v)) as max_i
    from me
  ),
  cand as (
    select c.id, c.online, public.role_cat(c.role) as cat, c.age_shown, public.detail_tags(c.details) as tags
    from profiles c, pref
    where c.id <> pref.id and not c.is_anon and not c.ghost and c.location is not null
      and st_dwithin(c.location, st_makepoint(lng, lat)::geography, least(radius_meters, 50000))
      and not exists (select 1 from bans x where x.user_id = c.id and (x.expires_at is null or x.expires_at > now()))
      and not exists (select 1 from blocks k where (k.blocker = pref.id and k.blocked = c.id) or (k.blocker = c.id and k.blocked = pref.id))
      and not exists (select 1 from likes l where l.from_user = pref.id and l.to_user = c.id)
  ),
  fit as (
    select c.id, c.online,
      case when pref.has_b then coalesce((pref.b -> 'interest' ->> c.cat)::numeric, 0) / nullif(pref.max_i, 0)
           else public.stated_role_fit(pref.cat, c.cat) end as f_pos,
      public.tag_fit(pref.want_tags, c.tags) as f_tag,
      case when pref.has_b then public.age_fit(c.age_shown, (pref.b ->> 'age_avg')::numeric, (pref.b ->> 'age_sd')::numeric)
           else public.age_fit(c.age_shown, pref.age, 6) end as f_age,
      pref.id as me_id
    from cand c, pref
  ),
  scored as (
    select f.*,
      (coalesce(f.f_pos, 0) * 0.5 + coalesce(f.f_tag, 0) * 0.3 + coalesce(f.f_age, 0) * 0.2)
        / nullif((case when f.f_pos is null then 0 else 0.5 end) + (case when f.f_tag is null then 0 else 0.3 end) + (case when f.f_age is null then 0 else 0.2 end), 0)
        + case when f.online then 0.05 else 0 end as s
    from fit f
  )
  select s.id, least(100, round(s.s * 100))::int,
         array_remove(array[case when s.f_age >= 0.6 then 'Age' end,
                            case when s.f_pos >= 0.6 then 'Position' end,
                            case when s.f_tag >= 0.5 then 'Kinks' end], null)
  from scored s
  where s.s >= 0.4
  order by s.s desc, md5(s.me_id::text || s.id::text || current_date::text)
  limit 12
$$;

-- ── Second chances: people you had a real back-and-forth with who are nearby again ─
-- Both sides sent at least one message, last message 3–180 days ago, they're within range and
-- were around in the last day. Only ever about the caller's own chats.
create or replace function public.second_chances(lat double precision, lng double precision, radius_meters integer default 25000)
returns table(id uuid, last_chat_at timestamptz, met text)
language sql stable security definer set search_path to 'public', 'extensions' as $$
  select o.id, lc.last_at, r.met
  from matches x
  cross join lateral (select case when x.user_a = auth.uid() then x.user_b else x.user_a end as oid) q
  join profiles o on o.id = q.oid
  cross join lateral (select max(m.created_at) as last_at, count(distinct m.sender_id) as senders
                      from messages m where m.match_id = x.id) lc
  left join reviews r on r.reviewer_id = auth.uid() and r.reviewee_id = o.id
  where auth.uid() in (x.user_a, x.user_b)
    and not public.i_am_banned()
    and lc.senders = 2
    and lc.last_at < now() - interval '3 days' and lc.last_at > now() - interval '180 days'
    and not o.is_anon and not o.ghost and o.location is not null
    and (o.online or o.last_seen > now() - interval '24 hours')
    and st_dwithin(o.location, st_makepoint(lng, lat)::geography, least(radius_meters, 50000))
    and not exists (select 1 from bans b where b.user_id = o.id and (b.expires_at is null or b.expires_at > now()))
    and not exists (select 1 from blocks k where (k.blocker = auth.uid() and k.blocked = o.id) or (k.blocker = o.id and k.blocked = auth.uid()))
  order by o.online desc, lc.last_at desc
  limit 10
$$;

revoke execute on function public.profile_insight(uuid), public.picked_for_you(double precision, double precision, integer),
  public.second_chances(double precision, double precision, integer) from public, anon;
grant execute on function public.profile_insight(uuid), public.picked_for_you(double precision, double precision, integer),
  public.second_chances(double precision, double precision, integer) to authenticated;
