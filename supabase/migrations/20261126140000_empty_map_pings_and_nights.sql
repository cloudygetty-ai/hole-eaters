-- Empty map, made useful: "ping me when someone shows up" + nights at spots, each with its own Pulse Room.
--
-- Pings go through the existing queue_push() (Web Push via the `notify` function today; Citadel once its
-- Vault secrets exist), so nothing new to configure. One pg_cron job every 5 minutes runs run_map_jobs():
--   1) map watches: the first time a visible member is on the map within 25 km, one discreet push, then the watch ends
--   2) nights: when a night starts, open its Pulse Room (lasts until the night ends) and push everyone going
--   3) prune nights that ended a week ago and watches that expired unused
-- Everything is reached through the functions below; the tables have no client grants.
-- Rollback: select cron.unschedule('map-jobs'); then drop the functions and the three tables (nothing else uses them).

-- ── 1) Map watches ──────────────────────────────────────────────────────────────
create table if not exists public.map_watches (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  geo geography(point, 4326) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
alter table public.map_watches enable row level security;
revoke all on public.map_watches from anon, authenticated;

-- The point is rounded to ~1 km so a stored watch never pins someone's front door.
create or replace function public.set_map_watch(p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.i_am_banned() then return false; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return false; end if;
  insert into map_watches (user_id, geo, created_at, expires_at)
  values (auth.uid(), st_makepoint(round(p_lng::numeric, 2)::float8, round(p_lat::numeric, 2)::float8)::geography, now(), now() + interval '30 days')
  on conflict (user_id) do update set geo = excluded.geo, created_at = excluded.created_at, expires_at = excluded.expires_at;
  return true;
end $$;

create or replace function public.clear_map_watch() returns void
language sql security definer set search_path = public as $$
  delete from map_watches where user_id = auth.uid()
$$;

create or replace function public.my_map_watch() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from map_watches where user_id = auth.uid() and expires_at > now())
$$;

-- "Showed up" = what the map itself would show: a real, visible, unbanned, unblocked member who is
-- online now and was active after the watch was set. No name, distance or place goes in the push.
create or replace function public.ping_map_watchers() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in
    delete from map_watches w
    where w.user_id in (
      select w2.user_id
      from map_watches w2
      join profiles me on me.id = w2.user_id
      where w2.expires_at > now()
        and not exists (select 1 from bans b where b.user_id = w2.user_id and (b.expires_at is null or b.expires_at > now()))
        and not (coalesce((me.privacy->>'quiet_hours')::boolean, false)
                 and extract(hour from now() at time zone coalesce(nullif(me.tz, ''), 'America/New_York')) not between 8 and 21)
        and exists (
          select 1 from profiles p
          where p.id <> w2.user_id and not p.is_anon and not p.ghost and p.online and p.location is not null
            and p.last_seen > greatest(w2.created_at, now() - interval '10 minutes')
            and st_dwithin(p.location, w2.geo, 25000)
            and not exists (select 1 from bans b where b.user_id = p.id and (b.expires_at is null or b.expires_at > now()))
            and not exists (select 1 from blocks k where (k.blocker = p.id and k.blocked = w2.user_id) or (k.blocker = w2.user_id and k.blocked = p.id)))
      limit 200)
    returning w.user_id
  loop
    perform queue_push(r.user_id, '👀 Someone just showed up', 'They''re on the map near you now. Tap to look.', '/app?tab=map', 'map-watch');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── 2) Nights at spots ──────────────────────────────────────────────────────────
-- Admin-curated for now: nights are planned with venues, so there is no member queue to moderate.
create table if not exists public.spot_nights (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 40 and not public.has_unsafe_chars(title)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  room_id uuid references public.pulse_rooms(id) on delete set null,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint spot_nights_length check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours')
);
create index if not exists spot_nights_starts_at on public.spot_nights (starts_at);
create index if not exists spot_nights_spot on public.spot_nights (spot_id);

create table if not exists public.night_rsvps (
  night_id uuid not null references public.spot_nights(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (night_id, user_id)
);
create index if not exists night_rsvps_user on public.night_rsvps (user_id);

alter table public.spot_nights enable row level security;
alter table public.night_rsvps enable row level security;
revoke all on public.spot_nights, public.night_rsvps from anon, authenticated;

-- Upcoming (next 14 days) and live nights near a point. Counts only: who is going is never exposed.
create or replace function public.upcoming_nights(p_lat double precision, p_lng double precision, p_radius integer default 40000)
returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz, spot_id uuid, spot_name text, spot_kind text,
               lat double precision, lng double precision, going integer, i_am_going boolean, live boolean, room_id uuid)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.starts_at, n.ends_at, s.id, s.name, s.kind, s.lat, s.lng,
         (select count(*)::int from night_rsvps r where r.night_id = n.id),
         exists (select 1 from night_rsvps r where r.night_id = n.id and r.user_id = auth.uid()),
         n.starts_at <= now(),
         n.room_id
  from spot_nights n
  join spots s on s.id = n.spot_id
  where auth.uid() is not null and not public.i_am_banned()
    and s.status = 'approved'
    and n.ends_at > now() and n.starts_at < now() + interval '14 days'
    and st_dwithin(s.geo, st_makepoint(p_lng, p_lat)::geography, least(greatest(coalesce(p_radius, 40000), 500), 100000))
  order by n.starts_at
  limit 20
$$;

create or replace function public.add_night(p_spot uuid, p_title text, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can add nights' using errcode = '42501'; end if;
  if not exists (select 1 from spots where id = p_spot and status = 'approved') then
    raise exception 'That spot isn''t live' using errcode = '22023';
  end if;
  if p_starts_at is null or p_starts_at < now() - interval '1 hour' or p_starts_at > now() + interval '60 days' then
    raise exception 'Pick a start time in the next 60 days' using errcode = '22023';
  end if;
  if (select count(*) from spot_nights where spot_id = p_spot and ends_at > now()) >= 20 then perform too_fast('nights at this spot'); end if;
  insert into spot_nights (spot_id, title, starts_at, ends_at, created_by)
  values (p_spot, btrim(p_title), p_starts_at, p_ends_at, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Removing a night also closes its room if it is open.
create or replace function public.remove_night(p_night uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can remove nights' using errcode = '42501'; end if;
  delete from spot_nights where id = p_night returning room_id into v_room;
  if v_room is not null then delete from pulse_rooms where id = v_room; end if;
end $$;

-- "I'm going" doubles as the reminder: everyone going gets one push when the night starts.
create or replace function public.rsvp_night(p_night uuid, p_going boolean) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.i_am_banned() then return null; end if;
  if p_going then
    insert into night_rsvps (night_id, user_id)
    select n.id, auth.uid() from spot_nights n where n.id = p_night and n.ends_at > now()
    on conflict do nothing;
  else
    delete from night_rsvps where night_id = p_night and user_id = auth.uid();
  end if;
  return (select count(*)::int from night_rsvps where night_id = p_night);
end $$;

-- ── 3) The 5-minute job ─────────────────────────────────────────────────────────
-- Night rooms are inserted with no auth.uid(), so pulse_rooms_fill keeps the night's own expiry
-- (the room lasts until the night ends instead of the usual 60 minutes).
create or replace function public.run_map_jobs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pinged integer; opened integer := 0; started integer := 0; n record; v_room uuid;
begin
  pinged := public.ping_map_watchers();

  for n in
    select sn.id, sn.title, sn.ends_at, sn.created_by, sn.room_id, sn.reminded_at
    from spot_nights sn
    join spots s on s.id = sn.spot_id and s.status = 'approved'
    where sn.starts_at <= now() and sn.ends_at > now() and (sn.room_id is null or sn.reminded_at is null)
    for update of sn skip locked
  loop
    if n.room_id is null then
      insert into pulse_rooms (name, color, creator_id, creator_name, member_ids, expires_at)
      values (left(btrim(n.title), 40), '#B18A55', n.created_by, coalesce((select name from profiles where id = n.created_by), ''), '{}', n.ends_at)
      returning id into v_room;
      update spot_nights set room_id = v_room where id = n.id;
      opened := opened + 1;
    end if;
    if n.reminded_at is null then
      update spot_nights set reminded_at = now() where id = n.id;
      perform queue_push(r.user_id, '🌙 ' || left(btrim(n.title), 60) || ' is on', 'It just started and the room is open. Tap to join.', '/app?tab=map', 'night-' || n.id)
      from night_rsvps r where r.night_id = n.id;
      started := started + 1;
    end if;
  end loop;

  delete from spot_nights where ends_at < now() - interval '7 days';
  delete from map_watches where expires_at < now();
  return jsonb_build_object('pinged', pinged, 'rooms_opened', opened, 'nights_started', started);
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
revoke all on function public.set_map_watch(double precision, double precision) from public, anon;
revoke all on function public.clear_map_watch() from public, anon;
revoke all on function public.my_map_watch() from public, anon;
revoke all on function public.upcoming_nights(double precision, double precision, integer) from public, anon;
revoke all on function public.add_night(uuid, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.remove_night(uuid) from public, anon;
revoke all on function public.rsvp_night(uuid, boolean) from public, anon;
grant execute on function public.set_map_watch(double precision, double precision) to authenticated;
grant execute on function public.clear_map_watch() to authenticated;
grant execute on function public.my_map_watch() to authenticated;
grant execute on function public.upcoming_nights(double precision, double precision, integer) to authenticated;
grant execute on function public.add_night(uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.remove_night(uuid) to authenticated;
grant execute on function public.rsvp_night(uuid, boolean) to authenticated;
revoke all on function public.ping_map_watchers() from public, anon, authenticated;
revoke all on function public.run_map_jobs() from public, anon, authenticated;

select cron.schedule('map-jobs', '*/5 * * * *', 'select public.run_map_jobs()');
