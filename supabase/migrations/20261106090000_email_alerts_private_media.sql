-- Applied to production in two steps: email alerts on 2026-11-06, private media bucket on 2026-11-08.
-- 1) Email alerts for unread messages (opt-in: privacy.email_alerts)
--    Every 10 minutes pg_cron pokes the `email-alerts` edge function, which asks email_alert_batch() who is due
--    and sends one discreet email each through Resend. Nothing is sent until RESEND_API_KEY is set on the function.
--    Rules: real (non-guest) confirmed email, opted in, offline 10+ min, unread message 10+ min old that arrived
--    since the last email, at most one email per 6 h, quiet hours respected, blocked senders ignored.
create table public.email_alert_log (
  user_id uuid primary key references auth.users on delete cascade,
  last_sent_at timestamptz not null
);
alter table public.email_alert_log enable row level security;
revoke all on public.email_alert_log from anon, authenticated;

create or replace function public.email_alert_batch()
returns table (user_id uuid, email text, unread int, chats int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select pr.id as uid, u.email::text as addr,
           count(m.id)::int as n, count(distinct m.match_id)::int as c
    from profiles pr
    join auth.users u on u.id = pr.id
    join matches mt on pr.id in (mt.user_a, mt.user_b)
    join messages m on m.match_id = mt.id and m.sender_id <> pr.id and m.read_at is null
    left join email_alert_log l on l.user_id = pr.id
    where coalesce((pr.privacy->>'email_alerts')::boolean, false)
      and u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
      and not exists (select 1 from bans b where b.user_id = pr.id and (b.expires_at is null or b.expires_at > now()))
      and (not coalesce(pr.online, false) or pr.last_seen < now() - interval '10 minutes')
      and m.created_at between now() - interval '24 hours' and now() - interval '10 minutes'
      and (l.last_sent_at is null or (l.last_sent_at < now() - interval '6 hours' and m.created_at > l.last_sent_at))
      and not exists (select 1 from blocks bl where bl.blocker = pr.id and bl.blocked = m.sender_id)
      and not (coalesce((pr.privacy->>'quiet_hours')::boolean, false)
               and extract(hour from now() at time zone coalesce(nullif(pr.tz, ''), 'America/New_York')) not between 8 and 21)
    group by pr.id, u.email
    limit 100
  ), logged as (
    insert into email_alert_log (user_id, last_sent_at) select uid, now() from due
    on conflict (user_id) do update set last_sent_at = now()
    returning email_alert_log.user_id
  )
  select d.uid, d.addr, d.n, d.c from due d join logged g on g.user_id = d.uid;
end $$;
revoke all on function public.email_alert_batch() from public, anon, authenticated;
grant execute on function public.email_alert_batch() to service_role;

-- Can I get email alerts? (only real, confirmed email accounts)
create or replace function public.my_email_alerts_available()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users where id = auth.uid() and email is not null and email_confirmed_at is not null and not coalesce(is_anonymous, false))
$$;
revoke all on function public.my_email_alerts_available() from public, anon;
grant execute on function public.my_email_alerts_available() to authenticated;

create or replace function public.poke_email_alerts() returns void language plpgsql security definer set search_path = public, vault, net as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_secret';
  perform net.http_post(
    url := 'https://xebwdvtaivqjwbwbzdpv.supabase.co/functions/v1/email-alerts',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.poke_email_alerts() from public, anon, authenticated;
select cron.schedule('email-alerts', '*/10 * * * *', 'select public.poke_email_alerts()');

-- 2) Profile photos/videos/covers: private bucket, short-lived signed links for signed-in members only.
--    The app (src/lib/mediaUrl.ts) signs the stored URL at render time; links expire in 30 min.
update storage.buckets set public = false where id = 'media';
drop policy if exists media_public_read on storage.objects;
drop policy if exists media_read on storage.objects;
create policy media_read_members on storage.objects for select to authenticated
  using (bucket_id = 'media' and not public.i_am_banned());
-- The restrictive own-folder rule stays for listing/updating; reading any member's file is now allowed to members
alter policy media_list_own_folder on storage.objects
  using ((bucket_id <> 'media') or (auth.role() = 'authenticated'));
