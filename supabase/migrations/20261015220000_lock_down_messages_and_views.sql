-- Security fixes found by the 400-round test run. Applied 2026-10-20; re-test passed 22/22 checks x 400 rounds.

-- You can only send messages as yourself, and only delete your own.
create policy messages_send_as_self on public.messages
  as restrictive for insert to authenticated with check (sender_id = auth.uid());
create policy messages_delete_own on public.messages
  as restrictive for delete to authenticated using (sender_id = auth.uid());

-- You can only log a profile view as yourself.
create policy profile_views_viewer_is_self on public.profile_views
  as restrictive for insert to authenticated with check (viewer_id = auth.uid());

-- App users may only mark messages read; content, media, sender and chat never change.
create or replace function public.messages_only_read_receipts() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.content is distinct from old.content or new.media_url is distinct from old.media_url
    or new.media_type is distinct from old.media_type or new.sender_id is distinct from old.sender_id
    or new.match_id is distinct from old.match_id or new.created_at is distinct from old.created_at) then
    raise exception 'messages can only be marked as read' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger messages_only_read_receipts before update on public.messages
  for each row execute function public.messages_only_read_receipts();

-- Push new messages, likes and chats to the app instantly.
alter publication supabase_realtime add table public.messages, public.likes, public.matches, public.global_messages;
