-- Security audit 2026-10-30, phase 2 (after the app moved uploads to {uid}/... and ghost posts to the RPC).

-- Uploads, overwrites and browsing: your own folder only. Public photo links don't go through these rules.
create policy media_upload_own_folder on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'media' or (storage.foldername(name))[1] = auth.uid()::text);
create policy media_update_own_folder on storage.objects as restrictive for update to public
  using (bucket_id <> 'media' or (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id <> 'media' or (storage.foldername(name))[1] = auth.uid()::text);
create policy media_list_own_folder on storage.objects as restrictive for select to public
  using (bucket_id <> 'media' or (storage.foldername(name))[1] = auth.uid()::text or public.is_admin());

-- Past ghost posts: author kept privately for mods, removed from the public row.
insert into public.global_message_authors (message_id, author_id)
  select id, sender_id from public.global_messages where content like '👻 %' and sender_id is not null
  on conflict do nothing;
update public.global_messages set sender_id = null where content like '👻 %' and sender_id is not null;

-- The legacy `admins` policies referenced themselves (infinite recursion → bans/reports errored for
-- everyone) and an empty table. Point them all at is_admin().
alter policy admins_read on public.admins using (public.is_admin());
alter policy admin_log_admin on public.admin_log to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy bans_admin_all on public.bans to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy reports_admin_all on public.reports to authenticated using (public.is_admin()) with check (public.is_admin());

-- Last checker items: signed-in only for location updates; dead waitlist/event-trigger helpers locked.
revoke execute on function public.update_user_location(uuid, double precision, double precision), public.join_waitlist(text,text,text,text,text), public.waitlist_status(text) from public, anon;
grant execute on function public.update_user_location(uuid, double precision, double precision) to authenticated;
revoke execute on function public.rls_auto_enable() from authenticated;

-- PostGIS's spatial_ref_sys is owned by supabase_admin with full anon/authenticated grants we can't revoke.
-- Deleting SRID 4326 through the API would break every geography query (the map). Reject writes up front.
create or replace function public.api_request_guard() returns void
language plpgsql stable set search_path = public as $$
declare p text := coalesce(current_setting('request.path', true), ''); m text := coalesce(current_setting('request.method', true), 'GET');
begin
  if p ~* '^/(spatial_ref_sys|geometry_columns|geography_columns)' and m <> 'GET' then
    raise exception 'read only' using errcode = '42501';
  end if;
end $$;
grant execute on function public.api_request_guard() to anon, authenticated;
alter role authenticator set pgrst.db_pre_request = 'public.api_request_guard';
notify pgrst, 'reload config';
