-- Interim: production still runs the pre-heartbeat client (Vercel is not deploying new builds for the
-- hole-eaters project), so a 3-minute expiry could flip active users offline. 30 minutes still clears
-- days-stale flags. Tighten back to 3 minutes once the heartbeat client (230b7a5) is live:
--   replace '30 minutes' with '3 minutes' below and re-apply.
create or replace function public.sweep_stale_online() returns integer
language sql security definer set search_path = public as $$
  with swept as (
    update profiles set online = false
    where online and (last_seen is null or last_seen < now() - interval '30 minutes')
    returning 1)
  select count(*)::int from swept;
$$;
revoke all on function public.sweep_stale_online() from public, anon, authenticated;
