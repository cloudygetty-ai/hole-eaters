-- Push notifications for likes, taps/messages and profile views. Applied 2026-10-20.
-- Keys live in Supabase Vault (vapid_private_key, vapid_public_key, notify_secret); never commit them.
-- Flow: insert trigger -> queue_push() -> pg_net POST -> `notify` edge function -> Web Push to every saved device.

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subs_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subs_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_subs_update_own on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subs_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
    'public',  (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    'secret',  (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'));
$$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

create or replace function public.queue_push(recipient uuid, title text, body text, url text, tag text) returns void
language plpgsql security definer set search_path = public, vault, net as $$
declare s text;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = recipient) then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_secret';
  perform net.http_post(
    url := 'https://xebwdvtaivqjwbwbzdpv.supabase.co/functions/v1/notify',
    body := jsonb_build_object('user_id', recipient, 'title', title, 'body', body, 'url', url, 'tag', tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    timeout_milliseconds := 8000);
exception when others then
  raise warning 'queue_push failed: %', sqlerrm;
end $$;
revoke all on function public.queue_push(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; mutual bool;
begin
  select coalesce(nullif(trim(name), ''), 'Someone') into who from profiles where id = new.from_user;
  mutual := exists (select 1 from likes where from_user = new.to_user and to_user = new.from_user);
  perform queue_push(new.to_user,
    case when mutual then '🔥 It''s a match!' else '🔥 New like' end,
    case when mutual then 'You and ' || who || ' liked each other. Say hi.' else who || ' liked you' end,
    '/app?tab=inbox', 'like-' || new.from_user);
  return new;
exception when others then return new;
end $$;

-- Message text is never put in the notification, so nothing explicit shows on a lock screen.
create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; recipient uuid;
begin
  select case when m.user_a = new.sender_id then m.user_b else m.user_a end into recipient from matches m where m.id = new.match_id;
  if recipient is null then return new; end if;
  select coalesce(nullif(trim(name), ''), 'Someone') into who from profiles where id = new.sender_id;
  perform queue_push(recipient, who,
    case when new.media_url like '/stickers/%' and coalesce(new.content, '') = '' then 'Sent you a 🍑 tap'
         when new.media_type = 'image' then 'Sent you a photo'
         when new.media_type = 'video' then 'Sent you a video'
         when new.media_type = 'audio' then 'Sent you a voice note'
         else 'Sent you a message' end,
    '/app?tab=inbox', 'chat-' || new.match_id);
  return new;
exception when others then return new;
end $$;

create or replace function public.notify_on_view() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(nullif(trim(name), ''), 'Someone') into who from profiles where id = new.viewer_id;
  perform queue_push(new.viewed_id, '👀 Profile view', who || ' checked you out', '/app?tab=me', 'view-' || new.viewer_id);
  return new;
exception when others then return new;
end $$;

revoke all on function public.notify_on_like() from public, anon, authenticated;
revoke all on function public.notify_on_message() from public, anon, authenticated;
revoke all on function public.notify_on_view() from public, anon, authenticated;

create trigger push_on_like after insert on public.likes for each row execute function public.notify_on_like();
create trigger push_on_message after insert on public.messages for each row execute function public.notify_on_message();
create trigger push_on_view after insert on public.profile_views for each row execute function public.notify_on_view();
