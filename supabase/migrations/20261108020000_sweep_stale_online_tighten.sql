-- Heartbeat client (60s last_seen updates while visible) is live on hole-eaters.com, so restore the
-- 3-minute expiry: a closed tab or killed app drops off "online" within ~3-4 minutes.
create or replace function public.sweep_stale_online() returns integer
language sql security definer set search_path = public as $$
  with swept as (
    update profiles set online = false
    where online and (last_seen is null or last_seen < now() - interval '3 minutes')
    returning 1)
  select count(*)::int from swept;
$$;
revoke all on function public.sweep_stale_online() from public, anon, authenticated;
