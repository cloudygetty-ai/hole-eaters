-- Privacy + abuse hardening, 2026-10-30.
-- 1 private chat media · 2 no map triangulation · 3 discreet notifications · 4 server-side spam limits.

-- ── 1. Private chat media ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 157286400, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','video/x-m4v','audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav'])
on conflict (id) do update set public = false;

create or replace function public.is_match_member(m text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where id::text = m and auth.uid() in (user_a, user_b))
$$;
revoke execute on function public.is_match_member(text) from public, anon;
grant execute on function public.is_match_member(text) to authenticated;

create policy chat_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[2] = auth.uid()::text
              and public.is_match_member((storage.foldername(name))[1])
              and not public.blocked_in_match(((storage.foldername(name))[1])::uuid)
              and not public.i_am_banned());
create policy chat_read on storage.objects for select to authenticated
  using (bucket_id = 'chat' and (public.is_match_member((storage.foldername(name))[1]) or public.is_admin()));
create policy chat_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[2] = auth.uid()::text);

create or replace function public.is_own_media_url(u text) returns boolean
language sql immutable set search_path = public as $$
  select u is null
      or u ~ '^https://xebwdvtaivqjwbwbzdpv\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9._/ %()+=,@-]+$'
      or u ~ '^/stickers/[a-z0-9-]+\.webp$'
      or u ~ '^chat/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
$$;
alter table public.messages add constraint messages_chat_media_matches
  check (media_url is null or media_url not like 'chat/%'
         or (split_part(media_url, '/', 2) = match_id::text and split_part(media_url, '/', 3) = sender_id::text));
alter table public.profiles add constraint profiles_no_chat_media
  check (coalesce(photo_url, '') not like 'chat/%' and coalesce(video_url, '') not like 'chat/%' and coalesce(details->>'cover_url', '') not like 'chat/%');
alter table public.global_messages add constraint global_no_chat_media check (coalesce(media_url, '') not like 'chat/%');

-- ── 2. Map: no triangulation ───────────────────────────────────────────────────
-- Others' positions are snapped to a ~200 m grid cell and distances are measured to the cell centre
-- (rounded to 100 m, never under 100 m). Checking distances from several spots can only ever
-- recover the cell, not the person.
create or replace function public.nearby_users(lat double precision, lng double precision, radius_meters integer default 5000)
returns table(id uuid, name text, age integer, role text, bio text, emoji text, color text, photo_url text, video_url text,
              online boolean, cruising_status text, tags text[], details jsonb, last_seen timestamptz, location jsonb, distance_meters double precision)
language sql stable security definer set search_path to 'public', 'extensions' as $function$
  with cells as (
    select p.*,
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
  select c.id, c.name, c.age, c.role, c.bio, c.emoji, c.color,
         c.photo_url, c.video_url, c.online, c.cruising_status, c.tags, c.details, c.last_seen,
         jsonb_build_object('lat', round(c.cell_lat::numeric, 4), 'lng', round(c.cell_lng::numeric, 4)) as location,
         greatest(100, round(st_distance(st_makepoint(c.cell_lng, c.cell_lat)::geography, st_makepoint(lng, lat)::geography)::numeric, -2))::double precision as distance_meters
  from cells c
  order by c.online desc, distance_meters asc
  limit 200;
$function$;

-- ── 3. Discreet notifications (default on) ─────────────────────────────────────
-- Lock screens show "New activity" unless the person opts in to names and previews.
alter table public.profiles add column if not exists notify_previews boolean not null default false;
grant select (notify_previews) on public.profiles to authenticated;

create or replace function public.queue_push(recipient uuid, title text, body text, url text, tag text)
returns void language plpgsql security definer set search_path to 'public', 'vault', 'net' as $function$
declare
  c_url text;
  c_key text;
  s text;
begin
  if not coalesce((select notify_previews from public.profiles where id = recipient), false) then
    title := 'Hole Eaters';
    body := 'You have new activity';
  end if;

  select decrypted_secret into c_url from vault.decrypted_secrets where name = 'citadel_url';
  select decrypted_secret into c_key from vault.decrypted_secrets where name = 'citadel_secret_key';

  if c_url is not null and c_key is not null then
    -- Citadel knows every device (web, iOS, Android) and no-ops for users without any.
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

  -- Legacy path: Supabase edge function → Web Push.
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

-- ── 4. Spam limits (server-side; app users only, triggers/service role exempt) ─
create index if not exists likes_from_created_idx on public.likes (from_user, created_at);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at);
create index if not exists views_viewer_at_idx on public.profile_views (viewer_id, viewed_at);
create index if not exists reviews_reviewer_created_idx on public.reviews (reviewer_id, created_at);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at);
create index if not exists global_sender_created_idx on public.global_messages (sender_id, created_at);

create or replace function public.too_fast(what text) returns void language plpgsql as $$
begin
  raise exception 'Slow down: too many % right now. Try again in a bit.', what using errcode = '54000';
end $$;

create or replace function public.limit_likes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (select count(*) from likes where from_user = auth.uid() and created_at > now() - interval '1 hour') >= 150
    then perform too_fast('likes'); end if;
  return new;
end $$;
create trigger limit_likes before insert on public.likes for each row execute function public.limit_likes();

create or replace function public.limit_messages() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
       (select count(*) from messages where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 30
    or (select count(*) from messages where sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 600)
    then perform too_fast('messages'); end if;
  return new;
end $$;
create trigger limit_messages before insert on public.messages for each row execute function public.limit_messages();

-- Repeat views of the same profile within 6 h are dropped quietly (no duplicate "checked you out" alerts)
create or replace function public.limit_views() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from profile_views where viewer_id = new.viewer_id and viewed_id = new.viewed_id and viewed_at > now() - interval '6 hours')
    then return null; end if;
  if (select count(*) from profile_views where viewer_id = auth.uid() and viewed_at > now() - interval '1 hour') >= 300
    then return null; end if;
  return new;
end $$;
create trigger limit_views before insert on public.profile_views for each row execute function public.limit_views();

create or replace function public.limit_matches() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (select count(*) from matches where auth.uid() in (user_a, user_b) and created_at > now() - interval '1 hour') >= 60
    then perform too_fast('new chats'); end if;
  return new;
end $$;
create trigger limit_matches before insert on public.matches for each row execute function public.limit_matches();

create or replace function public.limit_reviews() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (select count(*) from reviews where reviewer_id = auth.uid() and created_at > now() - interval '1 day') >= 30
    then perform too_fast('reviews'); end if;
  return new;
end $$;
create trigger limit_reviews before insert on public.reviews for each row execute function public.limit_reviews();

create or replace function public.limit_reports() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20
    then perform too_fast('reports'); end if;
  return new;
end $$;
create trigger limit_reports before insert on public.reports for each row execute function public.limit_reports();

-- Global chat: counts named and ghost posts together (ghost authors live in global_message_authors)
create or replace function public.limit_global() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
      (select count(*) from global_messages g where g.sender_id = auth.uid() and g.created_at > now() - interval '1 minute')
    + (select count(*) from global_message_authors a join global_messages g on g.id = a.message_id
        where a.author_id = auth.uid() and g.sender_id is null and g.created_at > now() - interval '1 minute')) >= 10
    then perform too_fast('chat messages'); end if;
  return new;
end $$;
create trigger limit_global before insert on public.global_messages for each row execute function public.limit_global();

revoke execute on function public.too_fast(text), public.limit_likes(), public.limit_messages(), public.limit_views(),
  public.limit_matches(), public.limit_reviews(), public.limit_reports(), public.limit_global() from public, anon, authenticated;
