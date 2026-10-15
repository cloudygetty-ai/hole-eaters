-- Security fixes found by the 400-round test run (2026-10-15).

-- 1. Messages: you can only send as yourself.
--    messages_all (FOR ALL, membership check only) let a chat member insert with the other person as sender.
create policy messages_send_as_self on public.messages
  as restrictive for insert to authenticated
  with check (sender_id = auth.uid());

-- 2. Messages: you can only delete your own messages.
create policy messages_delete_own on public.messages
  as restrictive for delete to authenticated
  using (sender_id = auth.uid());

-- 3. Messages: chat members may only flip read receipts; message content is never editable.
revoke update on public.messages from authenticated, anon;
grant update (read_at) on public.messages to authenticated;

-- 4. Profile views: you can only log a view as yourself.
drop policy if exists profile_views_insert on public.profile_views;
create policy profile_views_insert on public.profile_views
  for insert to authenticated
  with check (viewer_id = auth.uid());

-- 5. Realtime: push new messages, likes and chats to the app instantly instead of polling.
do $$
declare t text;
begin
  foreach t in array array['messages', 'likes', 'matches', 'global_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
