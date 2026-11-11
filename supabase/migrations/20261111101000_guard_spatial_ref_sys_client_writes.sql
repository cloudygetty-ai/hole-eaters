-- (applied to production 2026-11-11)
-- spatial_ref_sys is owned by supabase_admin, so its anon/authenticated grants can't be revoked
-- and RLS can't be enabled. Block client-role writes with triggers instead.
create or replace function public.spatial_ref_sys_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'spatial_ref_sys is read-only' using errcode = '42501';
  end if;
  if tg_level = 'STATEMENT' then return null; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists spatial_ref_sys_guard_rows on public.spatial_ref_sys;
create trigger spatial_ref_sys_guard_rows
  before insert or update or delete on public.spatial_ref_sys
  for each row execute function public.spatial_ref_sys_guard();

drop trigger if exists spatial_ref_sys_guard_truncate on public.spatial_ref_sys;
create trigger spatial_ref_sys_guard_truncate
  before truncate on public.spatial_ref_sys
  for each statement execute function public.spatial_ref_sys_guard();
