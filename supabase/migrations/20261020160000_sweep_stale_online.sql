-- profiles.online was set on app open and cleared only on React unmount, which never runs when a
-- tab closes or the OS kills the app: 42/52 profiles were stuck "online". The client now heartbeats
-- last_seen every 60s while visible; this sweep is the authoritative expiry.

create extension if not exists pg_cron;

create or replace function public.sweep_stale_online() returns integer
language sql security definer set search_path = public as $$
  with swept as (
    update profiles set online = false
    where online and (last_seen is null or last_seen < now() - interval '3 minutes')
    returning 1)
  select count(*)::int from swept;
$$;
revoke all on function public.sweep_stale_online() from public, anon, authenticated;

select public.sweep_stale_online(); -- clear the existing backlog now

select cron.unschedule('sweep-stale-online') where exists (select 1 from cron.job where jobname = 'sweep-stale-online');
select cron.schedule('sweep-stale-online', '* * * * *', 'select public.sweep_stale_online()');
