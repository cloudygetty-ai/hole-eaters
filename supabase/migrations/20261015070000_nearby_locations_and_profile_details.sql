-- Real users on the map + profile details column.
-- Run in Supabase SQL editor (project xebwdvtaivqjwbwbzdpv) or via `supabase db push`.

-- Structured profile details (stats, interests, sexual health), all optional
alter table public.profiles add column if not exists details jsonb not null default '{}'::jsonb;

-- Undo is_anon=true written by the 2026-10-15 onboarding build; nearby_users hides is_anon profiles
update public.profiles set is_anon = false where is_anon = true and created_at >= '2026-10-15';

drop function if exists public.nearby_users(double precision, double precision, integer);

-- Returns approximate positions (3 decimals, about 100 m) so the map can place pins
-- without exposing exact homes, and rounds distance to 100 m. Excludes the caller.
create function public.nearby_users(lat double precision, lng double precision, radius_meters integer default 5000)
returns table(id uuid, name text, age integer, role text, bio text, emoji text, color text, photo_url text, video_url text,
              online boolean, cruising_status text, tags text[], details jsonb, last_seen timestamptz,
              location jsonb, distance_meters double precision)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, p.name, p.age, p.role, p.bio, p.emoji, p.color,
         p.photo_url, p.video_url, p.online, p.cruising_status, p.tags, p.details, p.last_seen,
         jsonb_build_object('lat', round(st_y(p.location::geometry)::numeric, 3),
                            'lng', round(st_x(p.location::geometry)::numeric, 3)) as location,
         round(st_distance(p.location, st_makepoint(lng, lat)::geography)::numeric, -2)::double precision as distance_meters
  from profiles p
  where p.is_anon = false
    and p.location is not null
    and p.id is distinct from auth.uid()
    and st_dwithin(p.location, st_makepoint(lng, lat)::geography, radius_meters)
  order by p.online desc, distance_meters asc
  limit 200;
$$;

grant execute on function public.nearby_users(double precision, double precision, integer) to anon, authenticated;
