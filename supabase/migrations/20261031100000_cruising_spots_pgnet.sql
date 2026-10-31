-- OpenStreetMap calls move into the database (pg_net). Overpass refuses requests from Supabase's
-- edge-function IPs (HTTP 406) but answers the database's own HTTP client, so:
--   request_venues(bbox)  queues the 0.25° tiles in view (each tile at most once a week, for everyone)
--   dispatch_osm()        sends at most 2 Overpass requests at a time (Overpass allows 2 slots per IP)
--   collect_osm()         every minute: stores finished venue tiles and finished school checks
--   add_spot(...)         now callable by members; the school/playground check runs right after,
--                         and a spot within 150 m of one is hidden before an admin ever sees it.

create or replace function public.url_encode(s text) returns text language sql immutable as $$
  select string_agg(case when c ~ '[A-Za-z0-9_.~-]' then c else upper(regexp_replace(encode(convert_to(c, 'utf8'), 'hex'), '(..)', '%\1', 'g')) end, '' order by i)
  from regexp_split_to_table(s, '') with ordinality as t(c, i)
$$;

alter table public.osm_tiles
  add column state text not null default 'done' check (state in ('queued','inflight','done')),
  add column request_id bigint,
  add column queued_at timestamptz;

alter table public.spots drop constraint spots_school_check_check;
alter table public.spots add constraint spots_school_check_check check (school_check in ('clear','unavailable','near_school'));
alter table public.spots add column school_req bigint;

create or replace function public.osm_get(query text) returns bigint language sql security definer set search_path = public as $$
  select net.http_get('https://overpass-api.de/api/interpreter?data=' || url_encode(query),
    headers := '{"Accept":"application/json","User-Agent":"hole-eaters.com/1.0 (cloudygetty@gmail.com)"}'::jsonb,
    timeout_milliseconds := 60000)
$$;

create or replace function public.dispatch_osm() returns void language plpgsql security definer set search_path = public as $$
declare r record; box text;
begin
  for r in select tile from osm_tiles where state = 'queued' order by queued_at
           limit greatest(0, 2 - (select count(*) from osm_tiles where state = 'inflight')) for update skip locked loop
    box := format('%s,%s,%s,%s', split_part(r.tile, ':', 1)::int * 0.25, split_part(r.tile, ':', 2)::int * 0.25,
                  (split_part(r.tile, ':', 1)::int + 1) * 0.25, (split_part(r.tile, ':', 2)::int + 1) * 0.25);
    update osm_tiles set state = 'inflight', request_id = osm_get(format(
      '[out:json][timeout:55];(nwr["lgbtq"~"^(primary|only)$"](%1$s);nwr["gay"~"^(yes|only)$"](%1$s);nwr["leisure"="sauna"]["lgbtq"~"^(primary|only|yes)$"](%1$s););out center tags 300;', box))
     where tile = r.tile;
  end loop;
end $$;

create or replace function public.request_venues(p_south float8, p_west float8, p_north float8, p_east float8)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; y int; x int;
begin
  if auth.uid() is null or i_am_banned() then return 0; end if;
  if (floor(p_north / 0.25) - floor(p_south / 0.25) + 1) * (floor(p_east / 0.25) - floor(p_west / 0.25) + 1) > 4 then return 0; end if;
  if (select count(*) from osm_tiles where state = 'queued') > 200 then return 0; end if; -- backlog guard
  for y in floor(p_south / 0.25)::int .. floor(p_north / 0.25)::int loop
    for x in floor(p_west / 0.25)::int .. floor(p_east / 0.25)::int loop
      insert into osm_tiles (tile, fetched_at, state, queued_at) values (y || ':' || x, now(), 'queued', now())
      on conflict (tile) do update set state = 'queued', fetched_at = now(), queued_at = now()
        where osm_tiles.state = 'done' and osm_tiles.fetched_at < now() - interval '7 days';
      if found then n := n + 1; end if;
    end loop;
  end loop;
  if n > 0 then perform dispatch_osm(); end if;
  return n;
end $$;

-- OSM rows that would break a constraint are skipped rather than failing the whole tile
create or replace function public.upsert_osm_spots(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into spots (osm_id, kind, name, description, lat, lng, website, source, status)
  select r->>'osm_id', r->>'kind', left(btrim(r->>'name'), 60), left(coalesce(r->>'description', ''), 500),
         (r->>'lat')::float8, (r->>'lng')::float8,
         case when r->>'website' ~* '^https?://[^\s<>"]{3,}$' then r->>'website' end, 'osm', 'approved'
  from jsonb_array_elements(p_rows) r
  where char_length(btrim(r->>'name')) between 2 and 60
    and not has_unsafe_chars(r->>'name') and not has_unsafe_chars(coalesce(r->>'description', ''))
    and r->>'name' !~* '(https?://|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})'
    and r->>'kind' is not null and r->>'lat' is not null and r->>'lng' is not null
  on conflict (osm_id) do update
    set kind = excluded.kind, name = excluded.name, description = excluded.description,
        lat = excluded.lat, lng = excluded.lng, website = excluded.website; -- status kept: admins can hide a venue for good
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.osm_venue_rows(elements jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(row), '[]') from (
    select jsonb_build_object(
      'osm_id', e->>'type' || '/' || (e->>'id'),
      'kind', case
        when t->>'leisure' = 'sauna' or t->>'amenity' in ('sauna','public_bath') then
          case when lower(t->>'name') ~ '(bath|spa|steam)' then 'bathhouse' else 'sauna' end
        when t->>'amenity' = 'nightclub' then 'club'
        when t->>'amenity' in ('bar','pub') then 'bar'
        when t->>'shop' = 'erotic' then 'adult_store'
        when t->>'amenity' = 'cinema' then 'theater' end,
      'name', t->>'name',
      'lat', coalesce(e->>'lat', e->'center'->>'lat'),
      'lng', coalesce(e->>'lon', e->'center'->>'lon'),
      'description', concat_ws(' · ', 'Hours: ' || (t->>'opening_hours'), nullif(btrim(concat_ws(' ', t->>'addr:housenumber', t->>'addr:street')), '')),
      'website', coalesce(t->>'website', t->>'contact:website')) as row
    from jsonb_array_elements(elements) e, lateral (select e->'tags' as t) x
    where t ? 'name'
  ) q where row->>'kind' is not null
$$;

create or replace function public.collect_osm() returns void language plpgsql security definer set search_path = public as $$
declare r record; res record; hits int;
begin
  -- Venue tiles
  for r in select tile, request_id, queued_at from osm_tiles where state = 'inflight' for update skip locked loop
    select status_code, content, timed_out, error_msg into res from net._http_response where id = r.request_id;
    if not found then
      if r.queued_at < now() - interval '10 minutes' then -- response lost: retry in about an hour
        update osm_tiles set state = 'done', fetched_at = now() - interval '7 days' + interval '1 hour' where tile = r.tile;
      end if;
      continue;
    end if;
    begin
      if res.status_code = 200 then
        perform upsert_osm_spots(osm_venue_rows(res.content::jsonb -> 'elements'));
        update osm_tiles set state = 'done', fetched_at = now() where tile = r.tile;
      else
        raise notice '[osm] tile % status % %', r.tile, res.status_code, res.error_msg;
        update osm_tiles set state = 'done', fetched_at = now() - interval '7 days' + interval '1 hour' where tile = r.tile;
      end if;
    exception when others then
      raise notice '[osm] tile % failed: %', r.tile, sqlerrm;
      update osm_tiles set state = 'done', fetched_at = now() - interval '7 days' + interval '1 hour' where tile = r.tile;
    end;
  end loop;

  -- School / playground checks on new community spots
  for r in select id, school_req, created_at from spots where school_check is null and school_req is not null for update skip locked loop
    select status_code, content into res from net._http_response where id = r.school_req;
    if not found then
      if r.created_at < now() - interval '10 minutes' then update spots set school_check = 'unavailable' where id = r.id; end if;
      continue;
    end if;
    begin
      if res.status_code = 200 then
        hits := jsonb_array_length(coalesce(res.content::jsonb -> 'elements', '[]'));
        if hits > 0 then update spots set school_check = 'near_school', status = 'hidden', reviewed_at = now() where id = r.id;
        else update spots set school_check = 'clear' where id = r.id; end if;
      else
        update spots set school_check = 'unavailable' where id = r.id;
      end if;
    exception when others then
      update spots set school_check = 'unavailable' where id = r.id;
    end;
  end loop;

  perform dispatch_osm();
end $$;

-- add_spot: members call it directly now
drop function public.add_spot(uuid, text, text, text, float8, float8, text);
create function public.add_spot(p_kind text, p_name text, p_description text, p_lat float8, p_lng float8)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null or i_am_banned() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if (select count(*) from spots where created_by = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    perform too_fast('new spots');
  end if;
  if exists (select 1 from spots where status <> 'hidden' and st_dwithin(geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, 40)) then
    raise exception 'That spot is already on the map.' using errcode = '23505';
  end if;
  insert into spots (kind, name, description, lat, lng, source, status, created_by)
  values (p_kind, btrim(p_name), btrim(coalesce(p_description, '')), p_lat, p_lng, 'community', 'pending', auth.uid())
  returning id into new_id;
  update spots set school_req = osm_get(format(
    '[out:json][timeout:20];(nwr(around:150,%1$s,%2$s)["amenity"~"^(school|kindergarten|childcare)$"];nwr(around:150,%1$s,%2$s)["leisure"="playground"];);out ids 1;', p_lat, p_lng))
   where id = new_id;
  return new_id;
end $$;

-- Owners also see their spot if the school check removed it, so the app can say why
create or replace function public.spots_in_view(p_south double precision, p_west double precision, p_north double precision, p_east double precision)
returns table (id uuid, kind text, name text, description text, lat double precision, lng double precision, source text, website text,
               status text, here_now int, active_votes int, gone_votes int, my_vote boolean, checked_in boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.name, s.description, s.lat, s.lng, s.source, s.website,
    case when s.status = 'hidden' then 'near_school' else s.status end,
    (select count(*)::int from spot_checkins c join profiles p on p.id = c.user_id
       where c.spot_id = s.id and c.at > now() - interval '2 hours' and not coalesce(p.ghost, false)),
    (select count(*)::int from spot_votes v where v.spot_id = s.id and v.active and v.at > now() - interval '90 days'),
    (select count(*)::int from spot_votes v where v.spot_id = s.id and not v.active and v.at > now() - interval '90 days'),
    (select v.active from spot_votes v where v.spot_id = s.id and v.user_id = auth.uid()),
    exists (select 1 from spot_checkins c where c.spot_id = s.id and c.user_id = auth.uid() and c.at > now() - interval '2 hours'),
    s.created_by is not distinct from auth.uid()
  from spots s
  where auth.uid() is not null and not i_am_banned()
    and p_north - p_south between 0 and 1.5 and p_east - p_west between 0 and 1.5
    and s.lat between p_south and p_north and s.lng between p_west and p_east
    and (s.status = 'approved'
         or (s.created_by = auth.uid() and (s.status = 'pending' or (s.status = 'hidden' and s.school_check = 'near_school' and s.created_at > now() - interval '7 days'))))
  order by (s.source = 'community') desc, s.created_at desc
  limit 300
$$;

drop function public.claim_osm_tile(text);
drop function public.release_osm_tile(text);

revoke all on function public.url_encode(text), public.osm_get(text), public.dispatch_osm(), public.collect_osm(), public.osm_venue_rows(jsonb),
  public.request_venues(float8, float8, float8, float8), public.add_spot(text, text, text, float8, float8) from public, anon, authenticated;
grant execute on function public.request_venues(float8, float8, float8, float8), public.add_spot(text, text, text, float8, float8) to authenticated;

select cron.schedule('collect-osm', '* * * * *', 'select public.collect_osm()');
