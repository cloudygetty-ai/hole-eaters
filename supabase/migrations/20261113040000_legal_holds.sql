-- Legal holds: preserve an account's data when the law requires it (subpoena/warrant/court order,
-- litigation hold, or an 18 U.S.C. § 2258A NCMEC report). Matches privacy.html.
-- Members can never tell whether they're held: no RPC exposes it, and guards are triggers that
-- either capture-then-allow (chat rows) or silently skip (account rows), never raise.

create table if not exists public.legal_holds (
  user_id   uuid primary key references auth.users(id) on delete restrict, -- held accounts can't be deleted by any path
  reason    text not null check (reason in ('legal_process', 'litigation', 'ncmec_report')),
  reference text,          -- case / subpoena / CyberTipline report number
  note      text,
  placed_by uuid not null, -- no FK: removing an admin must not touch holds
  placed_at timestamptz not null default now(),
  closed_at timestamptz    -- member deleted their account while held: login blocked, data kept
);

create table if not exists public.legal_hold_evidence (
  id          bigint generated always as identity primary key,
  held_user   uuid not null references public.legal_holds(user_id) on delete cascade,
  kind        text not null, -- profile | match | message | file_index
  source_id   uuid,
  data        jsonb not null,
  captured_at timestamptz not null default now()
);
create index if not exists legal_hold_evidence_user on public.legal_hold_evidence (held_user, kind);

-- Service role only. RLS on with no policies = invisible to anon/authenticated, admins included;
-- admins go through the legal-hold edge function, which checks admin_users.
alter table public.legal_holds enable row level security;
alter table public.legal_hold_evidence enable row level security;
revoke all on public.legal_holds, public.legal_hold_evidence from anon, authenticated;

-- Chat rows: copy into evidence, then let the delete go through. Fires on member deletes and on the
-- auth.users cascade when the *other* person deletes their account.
create or replace function public.legal_hold_capture() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; held uuid;
begin
  if tg_table_name = 'messages' then
    select user_a, user_b into a, b from matches where id = old.match_id;
  else
    a := old.user_a; b := old.user_b;
  end if;
  -- a/b are null when a message is cascade-deleted with its match; the match branch captured it already.
  for held in select h.user_id from legal_holds h where h.user_id in (a, b) loop
    if tg_table_name = 'messages' then
      insert into legal_hold_evidence (held_user, kind, source_id, data) values (held, 'message', old.id, to_jsonb(old));
    else
      -- FK cascades run after this row is gone, so take the whole conversation now.
      insert into legal_hold_evidence (held_user, kind, source_id, data) values (held, 'match', old.id, to_jsonb(old));
      insert into legal_hold_evidence (held_user, kind, source_id, data)
        select held, 'message', x.id, to_jsonb(x) from messages x where x.match_id = old.id;
    end if;
  end loop;
  return old;
end $$;

-- Profiles: a held profile row is never deleted (silently skipped; the auth FK covers deleteUser).
create or replace function public.legal_hold_keep_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from legal_holds where user_id = old.id) then return null; end if;
  return old;
end $$;

drop trigger if exists legal_hold_messages on public.messages;
create trigger legal_hold_messages before delete on public.messages for each row execute function public.legal_hold_capture();
drop trigger if exists legal_hold_matches on public.matches;
create trigger legal_hold_matches before delete on public.matches for each row execute function public.legal_hold_capture();
drop trigger if exists legal_hold_profiles on public.profiles;
create trigger legal_hold_profiles before delete on public.profiles for each row execute function public.legal_hold_keep_profile();

revoke execute on function public.legal_hold_capture(), public.legal_hold_keep_profile() from public, anon, authenticated;

-- Private evidence bucket; no storage policies, so only the service role can read or write it.
insert into storage.buckets (id, name, public) values ('legal-holds', 'legal-holds', false)
on conflict (id) do update set public = false;
