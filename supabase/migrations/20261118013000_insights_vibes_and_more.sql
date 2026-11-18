-- "Who's into you" Insights: adds vibes (new profiles.details.vibe), eat role, host/travel, top
-- interests, time of day and distance. Same rules as before: aggregates only, members who chose
-- hide_from_community_insights are left out, and nobody is named. Breakdowns built from other
-- members' profiles stay empty until at least 3 people contribute, so a single admirer can't be
-- picked out. Distance skips people in Ghost Mode or hiding their distance.
create or replace function public.my_insights(days integer default 30) returns jsonb
language sql stable security definer set search_path to 'public', 'extensions' as $$
  with me as (
    select p.id, p.location, least(greatest(coalesce(days, 30), 1), 90) as d,
           coalesce((select z.name from pg_timezone_names z where z.name = p.tz), 'America/New_York') as tz
    from profiles p where p.id = auth.uid()
  ),
  events as (
    select v.viewer_id as uid, 'view' as kind, v.viewed_at as at from profile_views v, me
     where v.viewed_id = me.id and v.viewed_at > now() - make_interval(days => me.d)
    union all
    select l.from_user, 'like', l.created_at from likes l, me
     where l.to_user = me.id and l.created_at > now() - make_interval(days => me.d)
    union all
    select m.sender_id, 'message', m.created_at from messages m join matches x on x.id = m.match_id, me
     where me.id in (x.user_a, x.user_b) and m.sender_id <> me.id and m.created_at > now() - make_interval(days => me.d)
  ),
  uniq as (select distinct uid from events),
  prof as (
    select p.id, p.role, p.details->>'body' as body, p.age,
           case when jsonb_typeof(p.details) = 'object' then p.details else '{}'::jsonb end as det,
           coalesce((p.privacy->>'hide_from_community_insights')::boolean, false) as no_comm,
           coalesce((p.privacy->>'hide_from_age_insights')::boolean, false) or coalesce((p.privacy->>'hide_age')::boolean, false) as no_age,
           case when p.ghost or coalesce((p.privacy->>'hide_distance')::boolean, false) or p.location is null or me.location is null then null
                else st_distance(p.location, me.location) end as dist_m
    from profiles p join uniq u on u.uid = p.id, me
  ),
  bucket as (
    select *, case when age < 26 then '18-25' when age < 36 then '26-35' when age < 46 then '36-45' when age < 56 then '46-55' else '56+' end as age_band from prof
  ),
  comm as (select * from bucket where not no_comm),
  arr as (  -- one row per (person, multi-select value) for the array-valued details
    select c.id, k, v from comm c, unnest(array['vibe', 'location']) k,
      lateral jsonb_array_elements_text(case when jsonb_typeof(c.det -> k) = 'array' then c.det -> k else '[]'::jsonb end) v
  ),
  tags as (select c.id, t from comm c, unnest(public.detail_tags(c.det)) t),
  vibe as (select v, count(distinct id) n from arr where k = 'vibe' group by v),
  host as (select v, count(distinct id) n from arr where k = 'location' and v in ('Can host', 'Can travel', 'Car', 'Hotel', 'Public') group by v),
  eat as (select det->>'eat_role' v, count(*) n from comm where det->>'eat_role' in ('Eater', 'Get eaten', 'Both') group by 1),
  dist as (
    select case when dist_m < 1609 then 'Under 1 mi' when dist_m < 8047 then '1–5 mi' when dist_m < 24140 then '5–15 mi' else '15+ mi' end as band, count(*) n
    from comm where dist_m is not null group by 1
  ),
  daypart as (
    select case when h between 6 and 11 then 'Morning' when h between 12 and 16 then 'Afternoon'
                when h between 17 and 21 then 'Evening' else 'Late night' end as part, count(*) n
    from (select extract(hour from e.at at time zone me.tz)::int as h from events e, me where e.kind in ('view', 'like')) x
    group by 1
  )
  select jsonb_build_object(
    'days', (select d from me),
    'views', (select count(*) from events where kind = 'view'),
    'likes', (select count(*) from events where kind = 'like'),
    'messages', (select count(distinct uid) from events where kind = 'message'),
    'people', (select count(*) from uniq),
    'by_role', coalesce((select jsonb_object_agg(role, n) from (select role, count(*) n from comm where role is not null group by role) t), '{}'),
    'by_body', coalesce((select jsonb_object_agg(body, n) from (select body, count(*) n from comm where body is not null group by body) t), '{}'),
    'by_age', coalesce((select jsonb_object_agg(age_band, n) from (select age_band, count(*) n from bucket where not no_age and age is not null group by age_band) t), '{}'),
    'by_vibe', case when (select count(distinct id) from arr where k = 'vibe') >= 3 then coalesce((select jsonb_object_agg(v, n) from vibe), '{}') else '{}' end,
    'by_host', case when (select count(distinct id) from arr where k = 'location') >= 3 then coalesce((select jsonb_object_agg(v, n) from host), '{}') else '{}' end,
    'by_eat', case when (select sum(n) from eat) >= 3 then coalesce((select jsonb_object_agg(v, n) from eat), '{}') else '{}' end,
    'by_distance', case when (select sum(n) from dist) >= 3 then coalesce((select jsonb_object_agg(band, n) from dist), '{}') else '{}' end,
    'by_time', coalesce((select jsonb_object_agg(part, n) from daypart), '{}'),
    'top_interests', case when (select count(distinct id) from tags) >= 3
      then coalesce((select jsonb_agg(jsonb_build_object('tag', t, 'n', n) order by n desc, t)
                     from (select t, count(distinct id) n from tags group by t having count(distinct id) >= 2 order by 2 desc, t limit 8) z), '[]')
      else '[]' end,
    'responsiveness', public.responsiveness((select id from me))
  )
$$;
