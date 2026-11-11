-- (applied to production 2026-11-11)
-- Pin profiles.created_at for client roles (closes the referral-window reset).
create or replace function public.profiles_pin_system_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_pin_system_columns on public.profiles;
create trigger profiles_pin_system_columns
  before insert or update on public.profiles
  for each row execute function public.profiles_pin_system_columns();

-- Duplicate admin policies (identical to the non-v2 ones).
drop policy if exists admin_log_admin_v2 on public.admin_log;
drop policy if exists bans_admin_v2 on public.bans;
drop policy if exists reports_admin_v2 on public.reports;

-- Waitlist: no client uses direct anon inserts; close the unvalidated path.
drop policy if exists allow_anon_insert on public.waitlist;
revoke insert on table public.waitlist from anon;

-- Fix mutable search_path on the three flagged functions.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('url_encode', 'osm_venue_rows', 'too_fast')
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end $$;
