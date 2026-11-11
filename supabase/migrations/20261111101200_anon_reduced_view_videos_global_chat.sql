-- (applied to production 2026-11-11)
-- Anonymous (no-email) sessions: no videos, no global chat. Map, text profiles and photos unchanged.

create or replace function public.is_anon_session()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
grant execute on function public.is_anon_session() to anon, authenticated, service_role;

-- Videos feed table
drop policy if exists videos_no_anon_session on public.videos;
create policy videos_no_anon_session on public.videos
  as restrictive for select to public
  using (not public.is_anon_session());

-- Storage: videos bucket, and video files in the media bucket (own folder still readable)
drop policy if exists videos_obj_no_anon_session on storage.objects;
create policy videos_obj_no_anon_session on storage.objects
  as restrictive for select to public
  using (bucket_id <> 'videos' or not public.is_anon_session());

drop policy if exists media_video_no_anon_session on storage.objects;
create policy media_video_no_anon_session on storage.objects
  as restrictive for select to public
  using (
    bucket_id <> 'media'
    or not public.is_anon_session()
    or (storage.foldername(name))[1] = (auth.uid())::text
    or (
      coalesce(metadata ->> 'mimetype', '') not like 'video/%'
      and lower(name) !~ '\.(mp4|webm|mov|m4v)$'
    )
  );

-- Global chat: no read, no post
drop policy if exists global_no_anon_session_read on public.global_messages;
create policy global_no_anon_session_read on public.global_messages
  as restrictive for select to public
  using (not public.is_anon_session());

drop policy if exists global_no_anon_session_write on public.global_messages;
create policy global_no_anon_session_write on public.global_messages
  as restrictive for insert to public
  with check (not public.is_anon_session());

create or replace function public.post_global_message(p_content text, p_ghost boolean default false, p_media_url text default null::text, p_media_type text default null::text)
 returns setof global_messages
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if public.is_anon_session() then raise exception 'create an account to use global chat' using errcode = '42501'; end if;
  if public.i_am_banned() then raise exception 'banned' using errcode = '42501'; end if;
  if char_length(coalesce(p_content, '')) > 1000 then raise exception 'too long'; end if;
  if p_media_type is not null and p_media_type not in ('image', 'video') then raise exception 'bad media type'; end if;
  insert into global_messages (sender_id, content, media_url, media_type)
    values (case when p_ghost then null else me end,
            case when p_ghost then '👻 ' || coalesce(p_content, '') else coalesce(p_content, '') end,
            p_media_url, p_media_type)
    returning id into new_id;
  insert into global_message_authors (message_id, author_id) values (new_id, me);
  return query select * from global_messages where id = new_id;
end $function$;

-- Map cards: don't hand anonymous sessions a video URL they can't load
create or replace function public.nearby_users(lat double precision, lng double precision, radius_meters integer default 5000)
 returns table(id uuid, name text, age integer, role text, bio text, emoji text, color text, photo_url text, video_url text, online boolean, cruising_status text, tags text[], details jsonb, last_seen timestamp with time zone, location jsonb, distance_meters double precision)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
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
         c.photo_url,
         case when public.is_anon_session() then null else c.video_url end,
         c.online, c.cruising_status, c.tags, c.details, c.last_seen,
         case when c.no_dist then null else jsonb_build_object('lat', round(c.cell_lat::numeric, 4), 'lng', round(c.cell_lng::numeric, 4)) end,
         case when c.no_dist then null else greatest(100, round(st_distance(st_makepoint(c.cell_lng, c.cell_lat)::geography, st_makepoint(lng, lat)::geography)::numeric, -2))::double precision end
  from cells c
  order by c.online desc, (case when c.no_dist then 1e9 else st_distance(st_makepoint(c.cell_lng, c.cell_lat)::geography, st_makepoint(lng, lat)::geography) end) asc
  limit 200;
$function$;
