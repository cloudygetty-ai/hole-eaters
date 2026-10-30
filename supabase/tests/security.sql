-- Database security regression tests. Safe to run against production: everything happens in one
-- transaction that is ALWAYS rolled back. Fails (non-zero exit) if any check fails.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
--
-- Needs at least 3 profiles with names. Impersonates users via request.jwt.claims + SET ROLE.

begin;

create temp table _results (ok boolean, what text) on commit drop;
grant all on _results to authenticated, anon;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_admin_db() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language sql as $$ insert into _results values (ok, what) $$;

do $t$
declare a uuid; b uuid; c uuid; mab uuid; n int; ok boolean; rid uuid; dm float8;
begin
  select id into a from profiles where name is not null order by created_at limit 1;
  select id into b from profiles where name is not null and id <> a order by created_at limit 1;
  select id into c from profiles where name is not null and id not in (a, b) order by created_at limit 1;
  update profiles set location = st_makepoint(-73.98571, 40.74843)::geography, ghost = false, is_anon = false where id in (a, b, c);
  delete from bans where user_id in (a, b, c);
  delete from blocks where blocker in (a, b, c) or blocked in (a, b, c);
  insert into matches(user_a, user_b) values (least(a,b), greatest(a,b)) on conflict do nothing;
  select id into mab from matches where user_a = least(a,b) and user_b = greatest(a,b);

  -- ── Signed-out visitors ──
  execute 'set local role anon';
  begin perform 1 from profiles limit 1; perform pg_temp.check(false, 'anon reads profiles'); exception when insufficient_privilege then perform pg_temp.check(true, 'anon cannot read profiles'); end;
  begin perform 1 from messages limit 1; perform pg_temp.check(false, 'anon reads messages'); exception when insufficient_privilege then perform pg_temp.check(true, 'anon cannot read messages'); end;
  begin perform * from nearby_users(40.75, -73.98); perform pg_temp.check(false, 'anon uses map'); exception when insufficient_privilege then perform pg_temp.check(true, 'anon cannot use the map'); end;
  execute 'reset role';

  -- ── Signed-in A ──
  perform pg_temp.as_user(a);
  begin perform location from profiles limit 1; perform pg_temp.check(false, 'exact GPS readable'); exception when insufficient_privilege then perform pg_temp.check(true, 'exact GPS not readable'); end;
  update profiles set name = 'hacked' where id = b; get diagnostics n = row_count; perform pg_temp.check(n = 0, 'cannot edit another profile');
  begin insert into messages(match_id, sender_id, content) values (mab, b, 'spoof'); perform pg_temp.check(false, 'sent as someone else'); exception when others then perform pg_temp.check(true, 'cannot send as someone else'); end;
  begin insert into bans(user_id, reason) values (b, 'x'); perform pg_temp.check(false, 'user can ban'); exception when others then perform pg_temp.check(true, 'users cannot ban'); end;
  begin update profiles set photo_url = 'javascript:alert(1)' where id = a; perform pg_temp.check(false, 'javascript: URL saved'); exception when check_violation then perform pg_temp.check(true, 'javascript:/outside URLs rejected'); end;
  begin update profiles set name = 'x' || chr(8238) || 'y' where id = a; perform pg_temp.check(false, 'bidi name saved'); exception when check_violation then perform pg_temp.check(true, 'invisible/bidi characters rejected'); end;
  begin insert into storage.objects(bucket_id, name, owner) values ('chat', mab || '/' || b || '/x.bin', a); perform pg_temp.check(false, 'uploaded as other person'); exception when others then perform pg_temp.check(true, 'chat upload only as yourself'); end;
  begin insert into storage.objects(bucket_id, name, owner) values ('media', b || '/x.png', a); perform pg_temp.check(false, 'uploaded into other folder'); exception when others then perform pg_temp.check(true, 'media upload only into own folder'); end;
  select x.distance_meters into dm from nearby_users(40.74843, -73.98571, 5000) x where x.id = b;
  perform pg_temp.check(dm >= 100 and dm::int % 100 = 0, 'distances coarse (no triangulation)');
  insert into blocks(blocked) values (c);
  perform pg_temp.as_admin_db();

  -- ── C (blocked by A) ──
  perform pg_temp.as_user(c);
  begin insert into likes(from_user, to_user) values (c, a); perform pg_temp.check(false, 'blocked user liked'); exception when others then perform pg_temp.check(true, 'blocked user cannot like'); end;
  select count(*) into n from nearby_users(40.74843, -73.98571, 5000) x where x.id = a; perform pg_temp.check(n = 0, 'blocker hidden from blocked user');
  select count(*) into n from storage.objects where bucket_id = 'chat' and name like mab || '/%'; perform pg_temp.check(n = 0, 'outsider cannot see chat files');
  perform pg_temp.as_admin_db();

  -- ── Ban B ──
  insert into bans(user_id, reason) values (b, 'test');
  perform pg_temp.as_user(b);
  begin insert into likes(from_user, to_user) values (b, a); perform pg_temp.check(false, 'banned user liked'); exception when others then perform pg_temp.check(true, 'banned user cannot like'); end;
  select count(*) into n from nearby_users(40.74843, -73.98571, 5000); perform pg_temp.check(n = 0, 'banned user sees nobody');
  perform pg_temp.as_admin_db();
  delete from bans where user_id = b;

  -- ── Encryption ──
  perform pg_temp.as_user(a);
  begin insert into user_keys(user_id, public_key) values (a, '{"kty":"EC","crv":"P-256","x":"a","y":"b","d":"secret"}'); perform pg_temp.check(false, 'private key accepted'); exception when check_violation then perform pg_temp.check(true, 'private keys are refused'); end;
  begin insert into messages(match_id, sender_id, content) values (mab, a, 'hello in plaintext'); perform pg_temp.check(false, 'plaintext message stored'); exception when insufficient_privilege then perform pg_temp.check(true, 'plaintext chat messages refused'); end;
  begin insert into messages(match_id, sender_id, content, enc) values (mab, a, '', '{"v":1,"sd":"x","iv":"x","ct":"x","k":{}}'); perform pg_temp.check(true, 'encrypted message accepted'); exception when others then perform pg_temp.check(false, 'encrypted message rejected: ' || sqlerrm); end;
  perform pg_temp.as_admin_db();

  -- ── Discreet notifications ──
  insert into push_subscriptions(user_id, endpoint, p256dh, auth) values (b, 'https://push.example/t-' || gen_random_uuid(), 'x', 'y');
  update profiles set notify_previews = false where id = b;
  perform queue_push(b, 'Mike', 'Mike liked you', '/app', 'like');
  select (convert_from(q.body, 'utf8'))::jsonb->>'title' = 'Hole Eaters' into ok from net.http_request_queue q order by q.id desc limit 1;
  perform pg_temp.check(coalesce(ok, false), 'lock screen discreet by default');

  -- ── Spam limits ──
  perform pg_temp.as_user(a);
  begin for n in 1..35 loop insert into messages(match_id, sender_id, content, enc) values (mab, a, '', '{"v":1,"sd":"x","iv":"x","ct":"x","k":{}}'); end loop;
    perform pg_temp.check(false, '35 messages/min allowed');
  exception when sqlstate '54000' then perform pg_temp.check(true, 'message flood stopped'); end;
  perform pg_temp.as_admin_db();
end $t$;

select case when ok then 'PASS' else 'FAIL' end as result, what from _results order by ok, what;

do $$ begin
  if exists (select 1 from _results where not ok) then
    raise exception 'security tests failed: %', (select string_agg(what, '; ') from _results where not ok);
  end if;
end $$;

rollback;
