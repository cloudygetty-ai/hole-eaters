-- Route push through Citadel (Web Push today; APNs/FCM once the native apps ship).
-- Dormant until BOTH Vault secrets exist — applying this changes nothing on its own:
--   select vault.create_secret('https://cloudygetty-citadel.fly.dev', 'citadel_url');
--   select vault.create_secret('ck_sec_…', 'citadel_secret_key');
-- Rollback = delete either secret; the original `notify` edge-function path resumes instantly.
--
-- Citadel user ids == auth.uid() (external auth), so `recipient` needs no mapping.
-- `tag` becomes the cross-platform collapse key: a newer like/chat push replaces the older one.

create or replace function public.queue_push(recipient uuid, title text, body text, url text, tag text) returns void
language plpgsql security definer set search_path = public, vault, net as $$
declare
  c_url text;
  c_key text;
  s text;
begin
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
end $$;

revoke all on function public.queue_push(uuid, text, text, text, text) from public, anon, authenticated;
