-- Privacy settings (Jack'd-style) + Insights ("who's into you"). Everything enforced server-side.

-- ── Settings storage ───────────────────────────────────────────────────────────
create or replace function public.valid_privacy(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('hide_age', 'hide_distance', 'stealth', 'quiet_hours', 'video_off', 'blur_media',
                           'hide_response_insight', 'hide_from_community_insights', 'hide_from_age_insights')
          or jsonb_typeof(e.value) <> 'boolean')
$$;

alter table public.profiles add column if not exists privacy jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists tz text;
alter table public.profiles add constraint profiles_privacy_valid check (public.valid_privacy(privacy));
alter table public.profiles add constraint profiles_tz_valid check (tz is null or (char_length(tz) <= 64 and tz ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'));

-- What other people see: blank when "Hide age" is on. The real age column becomes owner-only (via my_private()).
alter table public.profiles add column if not exists age_shown int
  generated always as (case when coalesce((privacy->>'hide_age')::boolean, false) then null else age end) stored;
grant select (age_shown) on public.profiles to authenticated;

create or replace function public.p(uid uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (privacy->>key)::boolean from profiles where id = uid), false)
$$;
revoke execute on function public.p(uuid, text) from public, anon, authenticated;

-- Your own private bits (real age, settings, time zone)
create or replace function public.my_private() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('age', age, 'privacy', privacy, 'tz', tz) from profiles where id = auth.uid()
$$;

-- What a chat partner may know about your chat settings (no other settings leak)
create or replace function public.chat_prefs(other uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('video', not public.p(other, 'video_off'))
$$;

revoke execute on function public.my_private(), public.chat_prefs(uuid) from public, anon;
grant execute on function public.my_private(), public.chat_prefs(uuid) to authenticated;

-- ── Map: hide age / distance ───────────────────────────────────────────────────
create or replace function public.nearby_users(lat double precision, lng double precision, radius_meters integer default 5000)
returns table(id uuid, name text, age integer, role text, bio text, emoji text, color text, photo_url text, video_url text,
              online boolean, cruising_status text, tags text[], details jsonb, last_seen timestamptz, location jsonb, distance_meters double precision)
language sql stable security definer set search_path to 'public', 'extensions' as $function$
  with cells as (
    select p.*,
           coalesce((p.privacy->>'hide_distance')::boolean, false) as no_dist,
           floor(st_y(p.location::geometry) / 0.002) * 0.002 + 0.001 as cell_lat,
           floor(st_x(p.location::geometry) / 0.002) * 0.002 + 0.001 as cell_lng
    from profiles p
    where p.is_anon = false
      and not p.ghost
      and p.location is not null
      and p.id is distinct from auth.uid()
      and not exists (select 1 from bans b where b.user_id = p.id and (b.expires_at is null or b.expires_at > now()))
      and not exists (select 1 from blocks k where (k.blocker = auth.uid() and k.blocked = p.id) or (k.blocker = p.id and k.blocked = auth.uid()))
      and not public.i_am_banned()
      and st_dwithin(p.location, st_makepoint(lng, lat)::geography, least(radius_meters, 100000))
  )
  select c.id, c.name, c.age_shown, c.role, c.bio, c.emoji, c.color,
         c.photo_url, c.video_url, c.online, c.cruising_status, c.tags, c.details, c.last_seen,
         case when c.no_dist then null else jsonb_build_object('lat', round(c.cell_lat::numeric, 4), 'lng', round(c.cell_lng::numeric, 4)) end,
         case when c.no_dist then null else greatest(100, round(st_distance(st_makepoint(c.cell_lng, c.cell_lat)::geography, st_makepoint(lng, lat)::geography)::numeric, -2))::double precision end
  from cells c
  order by c.online desc, (case when c.no_dist then 1e9 else st_distance(st_makepoint(c.cell_lng, c.cell_lat)::geography, st_makepoint(lng, lat)::geography) end) asc
  limit 200;
$function$;

-- ── Stealth: your profile views aren't logged (no "checked you out" alert) ──────
create or replace function public.limit_views() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.p(new.viewer_id, 'stealth') then return null; end if;
  if exists (select 1 from profile_views where viewer_id = new.viewer_id and viewed_id = new.viewed_id and viewed_at > now() - interval '6 hours')
    then return null; end if;
  if (select count(*) from profile_views where viewer_id = auth.uid() and viewed_at > now() - interval '1 hour') >= 300
    then return null; end if;
  return new;
end $$;

-- ── Quiet hours: no push alerts 10pm–8am in your time zone ────────────────────
create or replace function public.queue_push(recipient uuid, title text, body text, url text, tag text)
returns void language plpgsql security definer set search_path to 'public', 'vault', 'net' as $function$
declare
  c_url text;
  c_key text;
  s text;
  local_hour int;
begin
  if public.p(recipient, 'quiet_hours') then
    select extract(hour from now() at time zone coalesce(nullif(tz, ''), 'America/New_York'))::int into local_hour from public.profiles where id = recipient;
    if local_hour >= 22 or local_hour < 8 then return; end if;
  end if;

  if not coalesce((select notify_previews from public.profiles where id = recipient), false) then
    title := 'Hole Eaters';
    body := 'You have new activity';
  end if;

  select decrypted_secret into c_url from vault.decrypted_secrets where name = 'citadel_url';
  select decrypted_secret into c_key from vault.decrypted_secrets where name = 'citadel_secret_key';

  if c_url is not null and c_key is not null then
    perform net.http_post(
      url := rtrim(c_url, '/') || '/v1/push/send',
      body := jsonb_build_object(
        'userIds', jsonb_build_array(recipient),
        'notification', jsonb_build_object(
          'title', left(coalesce(title, 'Hole Eaters'), 80),
          'body', left(coalesce(body, ''), 160),
          'collapseKey', left(coalesce(tag, 'he-notification'), 64),
          'ttlSec', 3600,
          'data', jsonb_build_object('url', coalesce(url, '/')))),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-citadel-key', c_key),
      timeout_milliseconds := 8000);
    return;
  end if;

  if not exists (select 1 from public.push_subscriptions where user_id = recipient) then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_secret';
  perform net.http_post(
    url := 'https://xebwdvtaivqjwbwbzdpv.supabase.co/functions/v1/notify',
    body := jsonb_build_object('user_id', recipient, 'title', title, 'body', body, 'url', url, 'tag', tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    timeout_milliseconds := 8000);
exception when others then
  raise warning 'queue_push failed: %', sqlerrm;
end $function$;

-- ── Insights ───────────────────────────────────────────────────────────────────
-- Reply rate: of the chats where someone else messaged `who` in the last 60 days, how many did `who`
-- answer within 24 h. 1 (selective) … 10 (replies to everyone). Null with fewer than 3 chats.
create or replace function public.responsiveness(who uuid) returns int
language sql stable security definer set search_path = public as $$
  with incoming as (
    select m.match_id, min(m.created_at) as first_in
    from messages m join matches x on x.id = m.match_id
    where who in (x.user_a, x.user_b) and m.sender_id <> who and m.created_at > now() - interval '60 days'
    group by m.match_id
  ), answered as (
    select i.match_id, exists (select 1 from messages r where r.match_id = i.match_id and r.sender_id = who
                                and r.created_at > i.first_in and r.created_at < i.first_in + interval '24 hours') as ok
    from incoming i
  )
  select case when count(*) < 3 then null else (1 + round(9.0 * count(*) filter (where ok) / count(*)))::int end from answered
$$;
revoke execute on function public.responsiveness(uuid) from public, anon, authenticated;

-- Someone else's reply rate, shown on their profile (unless they hide it)
create or replace function public.get_responsiveness(target uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.p(target, 'hide_response_insight') then null else public.responsiveness(target) end
$$;

-- Who's into you: people who viewed / liked / messaged you, grouped by role, body type and age.
-- People who opted out are left out of that breakdown; nobody is ever named here.
create or replace function public.my_insights(days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, least(greatest(coalesce(days, 30), 1), 90) as d),
  people as (
    select v.viewer_id as uid, 'view' as kind from profile_views v, me where v.viewed_id = me.id and v.viewed_at > now() - make_interval(days => me.d)
    union all
    select l.from_user, 'like' from likes l, me where l.to_user = me.id and l.created_at > now() - make_interval(days => me.d)
    union all
    select distinct m.sender_id, 'message' from messages m join matches x on x.id = m.match_id, me
      where me.id in (x.user_a, x.user_b) and m.sender_id <> me.id and m.created_at > now() - make_interval(days => me.d)
  ),
  uniq as (select distinct uid from people),
  prof as (
    select p.id, p.role, p.details->>'body' as body, p.age,
           coalesce((p.privacy->>'hide_from_community_insights')::boolean, false) as no_comm,
           coalesce((p.privacy->>'hide_from_age_insights')::boolean, false) or coalesce((p.privacy->>'hide_age')::boolean, false) as no_age
    from profiles p join uniq u on u.uid = p.id
  ),
  bucket as (
    select *, case when age < 26 then '18-25' when age < 36 then '26-35' when age < 46 then '36-45' when age < 56 then '46-55' else '56+' end as age_band from prof
  )
  select jsonb_build_object(
    'days', (select d from me),
    'views', (select count(*) from people where kind = 'view'),
    'likes', (select count(*) from people where kind = 'like'),
    'messages', (select count(distinct uid) from people where kind = 'message'),
    'people', (select count(*) from uniq),
    'by_role', coalesce((select jsonb_object_agg(role, n) from (select role, count(*) n from bucket where not no_comm and role is not null group by role) t), '{}'),
    'by_body', coalesce((select jsonb_object_agg(body, n) from (select body, count(*) n from bucket where not no_comm and body is not null group by body) t), '{}'),
    'by_age', coalesce((select jsonb_object_agg(age_band, n) from (select age_band, count(*) n from bucket where not no_age and age is not null group by age_band) t), '{}'),
    'responsiveness', public.responsiveness((select id from me))
  )
$$;

revoke execute on function public.get_responsiveness(uuid), public.my_insights(int) from public, anon;
grant execute on function public.get_responsiveness(uuid), public.my_insights(int) to authenticated;
