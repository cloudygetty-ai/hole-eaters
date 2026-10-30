-- Security audit 2026-10-30, phase 1: fixes that don't depend on the app update.

-- ── Admin powers: policies pointed at the empty legacy `admins` table, so bans/reports silently failed.
create policy reports_admin_v2 on public.reports for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bans_admin_v2 on public.bans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_log_admin_v2 on public.admin_log for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Signed-out visitors: no database access except joining the waitlist.
revoke all on all tables in schema public from anon;
grant insert on public.waitlist to anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
-- TRUNCATE skips RLS entirely; nobody outside the server needs it.
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- ── Functions: signed-out callers only get the waitlist; dead/leaky helpers locked.
revoke execute on function public.is_admin(), public.is_banned(uuid), public.is_matched_with(uuid), public.claim_referral(text),
  public.my_invite_stats(), public.get_admin_stats(), public.get_vibe_summary(uuid), public.rls_auto_enable(), public.waitlist_demand()
  from public, anon;
grant execute on function public.is_admin(), public.is_matched_with(uuid), public.claim_referral(text), public.my_invite_stats(),
  public.get_admin_stats(), public.waitlist_demand() to authenticated;
revoke execute on function public.get_vibe_summary(uuid), public.is_banned(uuid) from authenticated; -- unused; leaked anyone's ban status

alter function public.gen_ref_code() set search_path = public;
alter function public.check_mutual_like() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.is_banned(uuid) set search_path = public;
alter function public.prune_global_messages() set search_path = public;
alter function public.reviews_guard() set search_path = public;
alter function public.messages_only_read_receipts() set search_path = public;
alter function public.enforce_social_cap() set search_path = public;
alter function public.touch_social() set search_path = public;

-- ── Bans actually stop people.
create or replace function public.i_am_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bans where user_id = auth.uid() and (expires_at is null or expires_at > now()))
$$;

-- ── Server-side blocking (was only saved on the blocker's phone).
create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy blocks_own_read on public.blocks for select to authenticated using (blocker = auth.uid());
create policy blocks_own_insert on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy blocks_own_remove on public.blocks for delete to authenticated using (blocker = auth.uid());
grant select, insert, delete on public.blocks to authenticated;

-- Either of us blocked the other
create or replace function public.blocked_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = auth.uid() and blocked = other) or (blocker = other and blocked = auth.uid()))
$$;
create or replace function public.blocked_in_match(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches x join blocks b
      on (b.blocker = x.user_a and b.blocked = x.user_b) or (b.blocker = x.user_b and b.blocked = x.user_a)
    where x.id = m)
$$;
revoke execute on function public.i_am_banned(), public.blocked_with(uuid), public.blocked_in_match(uuid) from public, anon;
grant execute on function public.i_am_banned(), public.blocked_with(uuid), public.blocked_in_match(uuid) to authenticated;

-- Restrictive = applies on top of existing rules. Banned or blocked → can't reach the person.
create policy msg_guard on public.messages as restrictive for insert to authenticated
  with check (not public.i_am_banned() and not public.blocked_in_match(match_id));
create policy likes_guard on public.likes as restrictive for insert to authenticated
  with check (not public.i_am_banned() and not public.blocked_with(to_user));
create policy views_guard on public.profile_views as restrictive for insert to authenticated
  with check (not public.i_am_banned() and not public.blocked_with(viewed_id));
create policy matches_guard on public.matches as restrictive for insert to authenticated
  with check (not public.i_am_banned() and not public.blocked_with(case when user_a = auth.uid() then user_b else user_a end));
create policy global_guard on public.global_messages as restrictive for insert to authenticated
  with check (not public.i_am_banned());
create policy reviews_guard_ban on public.reviews as restrictive for insert to authenticated
  with check (not public.i_am_banned() and not public.blocked_with(reviewee_id));

-- Map: hide banned users, people you blocked and people who blocked you.
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
    and not exists (select 1 from bans b where b.user_id = p.id and (b.expires_at is null or b.expires_at > now()))
    and not exists (select 1 from blocks k where (k.blocker = auth.uid() and k.blocked = p.id) or (k.blocker = p.id and k.blocked = auth.uid()))
    and not public.i_am_banned()
    and st_dwithin(p.location, st_makepoint(lng, lat)::geography, least(radius_meters, 100000))
  order by p.online desc, distance_meters asc
  limit 200;
$function$;

-- ── "Matches only" socials: a match row can be created by anyone, so require a real connection.
create or replace function public.is_matched_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not public.blocked_with(other) and (
    (exists (select 1 from likes where from_user = auth.uid() and to_user = other)
     and exists (select 1 from likes where from_user = other and to_user = auth.uid()))
    or public.chatted_with(other))
$$;

-- ── Storage: deleting and browsing only your own folder (public photo links keep working).
create policy media_delete_own_only on storage.objects as restrictive for delete to public
  using (bucket_id <> 'media' or (storage.foldername(name))[1] = auth.uid()::text);
create policy media_no_anon_upload on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'media' or auth.role() = 'authenticated');

-- ── Ghost posts in global chat: store no sender; the real author is kept privately for moderation.
create table if not exists public.global_message_authors (
  message_id uuid primary key references public.global_messages(id) on delete cascade,
  author_id uuid not null
);
alter table public.global_message_authors enable row level security;
create policy gma_admin_read on public.global_message_authors for select to authenticated using (public.is_admin());
grant select on public.global_message_authors to authenticated;

alter table public.global_messages alter column sender_id drop not null;

create or replace function public.post_global_message(p_content text, p_ghost boolean default false,
  p_media_url text default null, p_media_type text default null)
returns setof public.global_messages language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
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
end $$;
revoke execute on function public.post_global_message(text, boolean, text, text) from public, anon;
grant execute on function public.post_global_message(text, boolean, text, text) to authenticated;
