-- Postgres regex repetition counts max out at 255
alter table public.spots drop constraint spots_website_check;
alter table public.spots add constraint spots_website_check check (website is null or (char_length(website) <= 300 and website ~* '^https?://[^\s<>"]{3,}$'));

create or replace function public.upsert_osm_spots(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into spots (osm_id, kind, name, description, lat, lng, website, source, status)
  select r->>'osm_id', r->>'kind', left(btrim(r->>'name'), 60), left(coalesce(r->>'description', ''), 500),
         (r->>'lat')::float8, (r->>'lng')::float8,
         case when char_length(r->>'website') <= 300 and r->>'website' ~* '^https?://[^\s<>"]{3,}$' then r->>'website' end, 'osm', 'approved'
  from jsonb_array_elements(p_rows) r
  where char_length(btrim(r->>'name')) between 2 and 60
    and not has_unsafe_chars(r->>'name') and not has_unsafe_chars(coalesce(r->>'description', ''))
    and r->>'name' !~* '(https?://|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})'
    and r->>'kind' is not null and r->>'lat' is not null and r->>'lng' is not null
  on conflict (osm_id) do update
    set kind = excluded.kind, name = excluded.name, description = excluded.description,
        lat = excluded.lat, lng = excluded.lng, website = excluded.website;
  get diagnostics n = row_count;
  return n;
end $$;
