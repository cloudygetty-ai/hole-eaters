-- Daily database security checks, run inside Supabase by pg_cron (no external credentials needed).
-- Every check runs inside a savepoint that is always rolled back; only the results are kept.
-- Failures push-alert every admin. Same checks as supabase/tests/security.sql.

create table if not exists public.security_check_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  passed int not null,
  failed int not null,
  results jsonb not null
);
alter table public.security_check_runs enable row level security;
create policy security_runs_admin_read on public.security_check_runs for select to authenticated using (public.is_admin());
grant select on public.security_check_runs to authenticated;

-- Not SECURITY DEFINER on purpose: it switches roles (SET ROLE is not allowed inside definer functions).
-- Only the database owner (pg_cron) can run it.
create or replace function public.run_security_checks() returns jsonb
language plpgsql set search_path = public, extensions as $fn$
declare
  a uuid; b uuid; c uuid; mab uuid; n int; ok boolean; dm float8;
  r jsonb := '[]'; failed int; admin_id uuid;
begin
  select id into a from profiles where name is not null order by created_at limit 1;
  select id into b from profiles where name is not null and id <> a order by created_at limit 1;
  select id into c from profiles where name is not null and id not in (a, b) order by created_at limit 1;

  begin -- savepoint: everything in here is rolled back by the final RAISE
    update profiles set location = st_makepoint(-73.98571, 40.74843)::geography, ghost = false, is_anon = false where id in (a, b, c);
    update bans set expires_at = now() - interval '1 second' where user_id in (a, b, c);
    insert into matches(user_a, user_b) values (least(a,b), greatest(a,b)) on conflict do nothing;
    select id into mab from matches where user_a = least(a,b) and user_b = greatest(a,b);

    -- signed-out visitor
    execute 'set local role anon';
    begin perform 1 from profiles limit 1; r := r || jsonb_build_object('ok', false, 'what', 'anon cannot read profiles'); exception when insufficient_privilege then r := r || jsonb_build_object('ok', true, 'what', 'anon cannot read profiles'); end;
    begin perform 1 from messages limit 1; r := r || jsonb_build_object('ok', false, 'what', 'anon cannot read messages'); exception when insufficient_privilege then r := r || jsonb_build_object('ok', true, 'what', 'anon cannot read messages'); end;
    begin perform * from nearby_users(40.75, -73.98); r := r || jsonb_build_object('ok', false, 'what', 'anon cannot use the map'); exception when insufficient_privilege then r := r || jsonb_build_object('ok', true, 'what', 'anon cannot use the map'); end;
    execute 'reset role';

    -- signed-in A
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin perform location from profiles limit 1; r := r || jsonb_build_object('ok', false, 'what', 'exact GPS not readable'); exception when insufficient_privilege then r := r || jsonb_build_object('ok', true, 'what', 'exact GPS not readable'); end;
    update profiles set name = 'hacked' where id = b; get diagnostics n = row_count; r := r || jsonb_build_object('ok', n = 0, 'what', 'cannot edit another profile');
    begin insert into messages(match_id, sender_id, content, enc) values (mab, b, '', '{"v":1,"sd":"x","iv":"x","ct":"x","k":{}}'); r := r || jsonb_build_object('ok', false, 'what', 'cannot send as someone else'); exception when others then r := r || jsonb_build_object('ok', true, 'what', 'cannot send as someone else'); end;
    begin insert into messages(match_id, sender_id, content) values (mab, a, 'plaintext'); r := r || jsonb_build_object('ok', false, 'what', 'plaintext chat refused'); exception when insufficient_privilege then r := r || jsonb_build_object('ok', true, 'what', 'plaintext chat refused'); end;
    begin insert into bans(user_id, reason) values (b, 'x'); r := r || jsonb_build_object('ok', false, 'what', 'users cannot ban'); exception when others then r := r || jsonb_build_object('ok', true, 'what', 'users cannot ban'); end;
    begin update profiles set photo_url = 'javascript:alert(1)' where id = a; r := r || jsonb_build_object('ok', false, 'what', 'javascript:/outside URLs rejected'); exception when check_violation then r := r || jsonb_build_object('ok', true, 'what', 'javascript:/outside URLs rejected'); end;
    begin update profiles set name = 'x' || chr(8238) || 'y' where id = a; r := r || jsonb_build_object('ok', false, 'what', 'invisible/bidi characters rejected'); exception when check_violation then r := r || jsonb_build_object('ok', true, 'what', 'invisible/bidi characters rejected'); end;
    begin insert into storage.objects(bucket_id, name, owner) values ('chat', mab || '/' || b || '/x.bin', a); r := r || jsonb_build_object('ok', false, 'what', 'chat upload only as yourself'); exception when others then r := r || jsonb_build_object('ok', true, 'what', 'chat upload only as yourself'); end;
    begin insert into storage.objects(bucket_id, name, owner) values ('media', b || '/x.png', a); r := r || jsonb_build_object('ok', false, 'what', 'media upload only into own folder'); exception when others then r := r || jsonb_build_object('ok', true, 'what', 'media upload only into own folder'); end;
    begin insert into user_keys(user_id, public_key) values (a, '{"kty":"EC","crv":"P-256","x":"a","y":"b","d":"secret"}'); r := r || jsonb_build_object('ok', false, 'what', 'private keys refused'); exception when check_violation then r := r || jsonb_build_object('ok', true, 'what', 'private keys refused'); end;
    select x.distance_meters into dm from nearby_users(40.74843, -73.98571, 5000) x where x.id = b;
    r := r || jsonb_build_object('ok', coalesce(dm >= 100 and dm::int % 100 = 0, false), 'what', 'distances coarse (no triangulation)');
    insert into blocks(blocked) values (c);
    execute 'reset role';

    -- C, blocked by A
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin insert into likes(from_user, to_user) values (c, a); r := r || jsonb_build_object('ok', false, 'what', 'blocked user cannot like'); exception when others then r := r || jsonb_build_object('ok', true, 'what', 'blocked user cannot like'); end;
    select count(*) into n from nearby_users(40.74843, -73.98571, 5000) x where x.id = a; r := r || jsonb_build_object('ok', n = 0, 'what', 'blocker hidden from blocked user');
    select count(*) into n from storage.objects where bucket_id = 'chat' and name like mab || '/%'; r := r || jsonb_build_object('ok', n = 0, 'what', 'outsider cannot see chat files');
    execute 'reset role';

    -- B banned
    insert into bans(user_id, reason) values (b, 'security check') on conflict (user_id) do update set expires_at = null;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin insert into likes(from_user, to_user) values (b, a); r := r || jsonb_build_object('ok', false, 'what', 'banned user cannot like'); exception when others then r := r || jsonb_build_object('ok', true, 'what', 'banned user cannot like'); end;
    select count(*) into n from nearby_users(40.74843, -73.98571, 5000); r := r || jsonb_build_object('ok', n = 0, 'what', 'banned user sees nobody');
    execute 'reset role';

    -- discreet lock screen
    insert into push_subscriptions(user_id, endpoint, p256dh, auth) values (b, 'https://push.example/check-' || gen_random_uuid(), 'x', 'y');
    update profiles set notify_previews = false where id = b;
    perform queue_push(b, 'Mike', 'Mike liked you', '/app', 'like');
    select (convert_from(q.body, 'utf8'))::jsonb->>'title' = 'Hole Eaters' into ok from net.http_request_queue q order by q.id desc limit 1;
    r := r || jsonb_build_object('ok', coalesce(ok, false), 'what', 'lock screen discreet by default');

    -- spam limit
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      for n in 1..35 loop insert into messages(match_id, sender_id, content, enc) values (mab, a, '', '{"v":1,"sd":"x","iv":"x","ct":"x","k":{}}'); end loop;
      r := r || jsonb_build_object('ok', false, 'what', 'message flood stopped');
    exception when sqlstate '54000' then r := r || jsonb_build_object('ok', true, 'what', 'message flood stopped'); end;
    execute 'reset role';

    raise exception 'rollback';
  exception when others then
    -- Savepoint rolled back: test changes and role switches are gone. PL/pgSQL variables (r) survive.
    if sqlerrm <> 'rollback' then
      r := r || jsonb_build_object('ok', false, 'what', 'check crashed: ' || sqlerrm);
    end if;
  end;

  select count(*) filter (where not (e->>'ok')::boolean) into failed from jsonb_array_elements(r) e;
  insert into security_check_runs(passed, failed, results) values (jsonb_array_length(r) - failed, failed, r);

  if failed > 0 then
    for admin_id in select user_id from admin_users loop
      perform queue_push(admin_id, '⚠️ Security check failed', failed || ' of ' || jsonb_array_length(r) || ' checks failed. Open the admin dashboard.', '/app?tab=me', 'security-check');
    end loop;
  end if;
  return jsonb_build_object('passed', jsonb_array_length(r) - failed, 'failed', failed);
end $fn$;

revoke execute on function public.run_security_checks() from public, anon, authenticated;

-- Every day at 09:17 UTC
select cron.schedule('daily-security-checks', '17 9 * * *', 'select public.run_security_checks()');
