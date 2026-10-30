-- 1. Exact GPS was readable by anyone (even signed out) via GET /rest/v1/profiles?select=location.
--    Nobody reads the raw column anymore: the map gets ~100 m rounded points from nearby_users(),
--    and you write your own position through update_user_location().
-- 2. Ghost Mode was client-only, so ghosted users still showed on everyone's map. Now it's a
--    saved column that nearby_users() respects.
-- 3. Signed-out visitors can't read profiles at all (guests sign in anonymously, so the app is unaffected).

alter table public.profiles add column if not exists ghost boolean not null default false;

revoke select on public.profiles from anon, authenticated;
grant select (id, name, age, role, bio, emoji, color, photo_url, video_url, is_anon, tags, cruising_status,
              online, last_seen, created_at, updated_at, can_host, details, ref_code, ghost)
  on public.profiles to authenticated;

create or replace function public.nearby_users(lat double precision, lng double precision, radius_meters integer default 5000)
returns table(id uuid, name text, age integer, role text, bio text, emoji text, color text, photo_url text, video_url text,
              online boolean, cruising_status text, tags text[], details jsonb, last_seen timestamptz, location jsonb, distance_meters double precision)
language sql stable security definer set search_path to 'public', 'extensions' as $function$
  select p.id, p.name, p.age, p.role, p.bio, p.emoji, p.color,
         p.photo_url, p.video_url, p.online, p.cruising_status, p.tags, p.details, p.last_seen,
         jsonb_build_object('lat', round(st_y(p.location::geometry)::numeric, 3),
                            'lng', round(st_x(p.location::geometry)::numeric, 3)) as location,
         round(st_distance(p.location, st_makepoint(lng, lat)::geography)::numeric, -2)::double precision as distance_meters
  from profiles p
  where p.is_anon = false
    and not p.ghost
    and p.location is not null
    and p.id is distinct from auth.uid()
    and st_dwithin(p.location, st_makepoint(lng, lat)::geography, least(radius_meters, 100000))
  order by p.online desc, distance_meters asc
  limit 200;
$function$;

revoke execute on function public.nearby_users(double precision, double precision, integer) from public, anon;
grant execute on function public.nearby_users(double precision, double precision, integer) to authenticated;
