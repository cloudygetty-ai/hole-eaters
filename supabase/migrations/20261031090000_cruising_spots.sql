-- Cruising spots on the map.
--   community: members pin a spot → pending → admin approves. The `spots` edge function checks
--              for schools/playgrounds within 150 m before the row is created (add_spot is service-role only).
--   osm:       public LGBTQ venues (bars, clubs, saunas, adult stores) cached from OpenStreetMap by the
--              same edge function, one 0.25° tile at a time, refreshed weekly.
-- All reads and writes go through SECURITY DEFINER functions; the tables themselves are closed to the API.

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('park','trail','beach','gym','sauna','bathhouse','adult_store','theater','bar','club','rest_stop','other')),
  name text not null check (char_length(btrim(name)) between 2 and 60 and not has_unsafe_chars(name)
                            and name !~* '(https?://|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})'),
  description text not null default '' check (char_length(description) <= 500 and not has_unsafe_chars(description)),
  lat double precision not null check (lat between -85 and 85),
  lng double precision not null check (lng between -180 and 180),
  geo geography(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  source text not null default 'community' check (source in ('community','osm')),
  osm_id text unique,
  website text check (website is null or website ~* '^https?://[^\s<>"]{3,}$'),
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  school_check text check (school_check in ('clear','unavailable')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  -- community text is checked for contact info; OSM names/descriptions come from the map data
  constraint spots_no_contact check (source = 'osm' or description !~* '(https?://|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})')
);
create index spots_geo_idx on public.spots using gist (geo);
create index spots_status_idx on public.spots (status);

create table public.spot_checkins (
  spot_id uuid not null references public.spots on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now(),
  primary key (spot_id, user_id)
);
create index spot_checkins_at_idx on public.spot_checkins (at);

create table public.spot_votes (
  spot_id uuid not null references public.spots on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  active boolean not null,
  at timestamptz not null default now(),
  primary key (spot_id, user_id)
);

create table public.spot_reports (
  spot_id uuid not null references public.spots on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reason text not null check (reason in ('not_there','near_kids','unsafe','spam','other')),
  at timestamptz not null default now(),
  primary key (spot_id, user_id)
);

create table public.osm_tiles (tile text primary key, fetched_at timestamptz not null default now());

alter table public.spots enable row level security;
alter table public.spot_checkins enable row level security;
alter table public.spot_votes enable row level security;
alter table public.spot_reports enable row level security;
alter table public.osm_tiles enable row level security;
revoke all on public.spots, public.spot_checkins, public.spot_votes, public.spot_reports, public.osm_tiles from anon, authenticated;

-- ── Reading ─────────────────────────────────────────────────────────────────
create or replace function public.spots_in_view(p_south double precision, p_west double precision, p_north double precision, p_east double precision)
returns table (id uuid, kind text, name text, description text, lat double precision, lng double precision, source text, website text,
               status text, here_now int, active_votes int, gone_votes int, my_vote boolean, checked_in boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.name, s.description, s.lat, s.lng, s.source, s.website, s.status,
    (select count(*)::int from spot_checkins c join profiles p on p.id = c.user_id
       where c.spot_id = s.id and c.at > now() - interval '2 hours' and not coalesce(p.ghost, false)),
    (select count(*)::int from spot_votes v where v.spot_id = s.id and v.active and v.at > now() - interval '90 days'),
    (select count(*)::int from spot_votes v where v.spot_id = s.id and not v.active and v.at > now() - interval '90 days'),
    (select v.active from spot_votes v where v.spot_id = s.id and v.user_id = auth.uid()),
    exists (select 1 from spot_checkins c where c.spot_id = s.id and c.user_id = auth.uid() and c.at > now() - interval '2 hours'),
    s.created_by is not distinct from auth.uid()
  from spots s
  where auth.uid() is not null and not i_am_banned()
    -- refuse continent-sized boxes: the app only asks at street/city zoom
    and p_north - p_south between 0 and 1.5 and p_east - p_west between 0 and 1.5
    and s.lat between p_south and p_north and s.lng between p_west and p_east
    and (s.status = 'approved' or (s.status = 'pending' and s.created_by = auth.uid()))
  order by (s.source = 'community') desc, s.created_at desc
  limit 300
$$;

-- ── Writing (members) ───────────────────────────────────────────────────────
-- Called only by the `spots` edge function after its school/playground check.
create or replace function public.add_spot(p_user uuid, p_kind text, p_name text, p_description text, p_lat double precision, p_lng double precision, p_school_check text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if exists (select 1 from bans where user_id = p_user and (expires_at is null or expires_at > now())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if (select count(*) from spots where created_by = p_user and created_at > now() - interval '1 day') >= 5 then
    perform too_fast('new spots');
  end if;
  if exists (select 1 from spots where status <> 'hidden' and st_dwithin(geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, 40)) then
    raise exception 'That spot is already on the map.' using errcode = '23505';
  end if;
  insert into spots (kind, name, description, lat, lng, source, status, school_check, created_by)
  values (p_kind, btrim(p_name), btrim(coalesce(p_description, '')), p_lat, p_lng, 'community', 'pending', p_school_check, p_user)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.check_in_spot(p_spot uuid)
returns int language plpgsql security definer set search_path = public as $$
declare me geography;
begin
  if auth.uid() is null or i_am_banned() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select location into me from profiles where id = auth.uid();
  if me is null then raise exception 'Turn on location to check in.' using errcode = '22023'; end if;
  -- You have to actually be there (1 km covers GPS drift and big parks)
  if not exists (select 1 from spots s where s.id = p_spot and s.status = 'approved' and st_dwithin(s.geo, me, 1000)) then
    raise exception 'Get closer to check in here.' using errcode = '22023';
  end if;
  insert into spot_checkins (spot_id, user_id) values (p_spot, auth.uid())
  on conflict (spot_id, user_id) do update set at = now();
  return (select count(*)::int from spot_checkins where spot_id = p_spot and at > now() - interval '2 hours');
end $$;

create or replace function public.check_out_spot(p_spot uuid)
returns void language sql security definer set search_path = public as $$
  update spot_checkins set at = now() - interval '1 day' where spot_id = p_spot and user_id = auth.uid()
$$;

create or replace function public.vote_spot(p_spot uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or i_am_banned() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from spots where id = p_spot and status = 'approved') then raise exception 'Spot not found' using errcode = 'P0002'; end if;
  insert into spot_votes (spot_id, user_id, active) values (p_spot, auth.uid(), p_active)
  on conflict (spot_id, user_id) do update set active = excluded.active, at = now();
end $$;

create or replace function public.report_spot(p_spot uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or i_am_banned() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if (select count(*) from spot_reports where user_id = auth.uid() and at > now() - interval '1 day') >= 20 then perform too_fast('reports'); end if;
  insert into spot_reports (spot_id, user_id, reason) values (p_spot, auth.uid(), p_reason) on conflict do nothing;
  -- A "near kids" report, or three reports from different people, pulls a community spot back for review
  update spots set status = 'pending'
   where id = p_spot and source = 'community' and status = 'approved'
     and (p_reason = 'near_kids' or (select count(*) from spot_reports where spot_id = p_spot) >= 3);
end $$;

-- ── Admin ───────────────────────────────────────────────────────────────────
create or replace function public.spots_for_review()
returns table (id uuid, kind text, name text, description text, lat double precision, lng double precision, source text, status text,
               school_check text, created_at timestamptz, creator_name text, reports int, reasons text[])
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.name, s.description, s.lat, s.lng, s.source, s.status, s.school_check, s.created_at,
         (select p.name from profiles p where p.id = s.created_by),
         (select count(*)::int from spot_reports r where r.spot_id = s.id),
         (select coalesce(array_agg(distinct r.reason), '{}') from spot_reports r where r.spot_id = s.id)
  from spots s
  where is_admin() and (s.status = 'pending' or (s.status = 'approved' and exists (select 1 from spot_reports r where r.spot_id = s.id)))
  order by s.created_at
  limit 200
$$;

create or replace function public.moderate_spot(p_spot uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_status not in ('approved','hidden') then raise exception 'Bad status' using errcode = '22023'; end if;
  update spots set status = p_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_spot;
  -- Approving clears old reports so the spot leaves the queue
  if p_status = 'approved' then delete from spot_reports where spot_id = p_spot; end if;
end $$;

-- ── OpenStreetMap cache (edge function only) ────────────────────────────────
create or replace function public.claim_osm_tile(p_tile text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into osm_tiles (tile, fetched_at) values (p_tile, now())
  on conflict (tile) do update set fetched_at = now() where osm_tiles.fetched_at < now() - interval '7 days';
  return found;
end $$;

-- Overpass failed: let the tile be retried in about an hour instead of a week
create or replace function public.release_osm_tile(p_tile text)
returns void language sql security definer set search_path = public as $$
  update osm_tiles set fetched_at = now() - interval '7 days' + interval '1 hour' where tile = p_tile
$$;

create or replace function public.upsert_osm_spots(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into spots (osm_id, kind, name, description, lat, lng, website, source, status)
  select r->>'osm_id', r->>'kind', left(btrim(r->>'name'), 60), left(coalesce(r->>'description', ''), 500),
         (r->>'lat')::float8, (r->>'lng')::float8, nullif(r->>'website', ''), 'osm', 'approved'
  from jsonb_array_elements(p_rows) r
  where char_length(btrim(r->>'name')) >= 2
  on conflict (osm_id) do update
    set kind = excluded.kind, name = excluded.name, description = excluded.description,
        lat = excluded.lat, lng = excluded.lng, website = excluded.website; -- status kept: admins can hide a venue for good
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on function public.spots_in_view(float8, float8, float8, float8), public.add_spot(uuid, text, text, text, float8, float8, text),
  public.check_in_spot(uuid), public.check_out_spot(uuid), public.vote_spot(uuid, boolean), public.report_spot(uuid, text),
  public.spots_for_review(), public.moderate_spot(uuid, text), public.claim_osm_tile(text), public.release_osm_tile(text), public.upsert_osm_spots(jsonb) from public, anon, authenticated;
grant execute on function public.spots_in_view(float8, float8, float8, float8), public.check_in_spot(uuid), public.check_out_spot(uuid),
  public.vote_spot(uuid, boolean), public.report_spot(uuid, text), public.spots_for_review(), public.moderate_spot(uuid, text) to authenticated;
grant execute on function public.add_spot(uuid, text, text, text, float8, float8, text), public.claim_osm_tile(text), public.release_osm_tile(text), public.upsert_osm_spots(jsonb) to service_role;

-- Check-ins only matter for two hours; keep a day for debugging, then drop them
select cron.schedule('prune-spot-checkins', '41 * * * *', $$delete from public.spot_checkins where at < now() - interval '1 day'$$);
