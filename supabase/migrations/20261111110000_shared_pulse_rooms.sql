-- Pulse Rooms were stored in each browser's localStorage, so nobody could see anyone else's room.
-- This makes them shared: every signed-in session (anonymous included) sees every live room.
-- Rooms last 60 minutes; an hourly job prunes expired ones (messages cascade).

create table if not exists public.pulse_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40 and not has_unsafe_chars(name)),
  color text not null default '#ff4d6d' check (color ~ '^#[0-9a-fA-F]{3,8}$'),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  creator_name text not null default '',
  member_ids uuid[] not null default '{}',
  expires_at timestamptz not null default now() + interval '60 minutes',
  created_at timestamptz not null default now()
);
create index if not exists pulse_rooms_expires_at on public.pulse_rooms (expires_at);

create table if not exists public.pulse_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pulse_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null default '',
  sender_emoji text not null default '🔥',
  sender_color text not null default '#ff4d6d',
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists pulse_room_messages_room on public.pulse_room_messages (room_id, created_at);

-- Server fills identity, display fields and expiry, so clients can't spoof a sender or extend a room.
create or replace function public.pulse_rooms_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return new; end if;
  if (select count(*) from pulse_rooms r where r.creator_id = me and r.expires_at > now()) >= 3 then
    perform too_fast('pulse rooms');
  end if;
  new.creator_id := me;
  new.creator_name := coalesce((select p.name from profiles p where p.id = me), '');
  new.member_ids := array[me];
  new.created_at := now();
  new.expires_at := now() + interval '60 minutes';
  return new;
end $$;
drop trigger if exists pulse_rooms_fill on public.pulse_rooms;
create trigger pulse_rooms_fill before insert on public.pulse_rooms
  for each row execute function public.pulse_rooms_fill();

create or replace function public.pulse_room_messages_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p record;
begin
  if me is null then return new; end if;
  if (select count(*) from pulse_room_messages m where m.sender_id = me and m.created_at > now() - interval '1 minute') >= 30 then
    perform too_fast('room messages');
  end if;
  select name, emoji, color into p from profiles where id = me;
  new.sender_id := me;
  new.sender_name := coalesce(p.name, '');
  new.sender_emoji := coalesce(p.emoji, '🔥');
  new.sender_color := coalesce(p.color, '#ff4d6d');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists pulse_room_messages_fill on public.pulse_room_messages;
create trigger pulse_room_messages_fill before insert on public.pulse_room_messages
  for each row execute function public.pulse_room_messages_fill();

alter table public.pulse_rooms enable row level security;
alter table public.pulse_room_messages enable row level security;

revoke all on public.pulse_rooms, public.pulse_room_messages from anon, authenticated;
grant select, insert on public.pulse_rooms, public.pulse_room_messages to authenticated;

drop policy if exists pulse_rooms_read on public.pulse_rooms;
create policy pulse_rooms_read on public.pulse_rooms for select to authenticated
  using (expires_at > now() and not public.i_am_banned() and not public.blocked_with(creator_id));

drop policy if exists pulse_rooms_create on public.pulse_rooms;
create policy pulse_rooms_create on public.pulse_rooms for insert to authenticated
  with check (creator_id = auth.uid() and not public.i_am_banned());

-- The room subquery runs under pulse_rooms RLS, so expired, banned and blocked cases are inherited.
drop policy if exists pulse_msgs_read on public.pulse_room_messages;
create policy pulse_msgs_read on public.pulse_room_messages for select to authenticated
  using (exists (select 1 from public.pulse_rooms r where r.id = room_id) and not public.blocked_with(sender_id));

drop policy if exists pulse_msgs_send on public.pulse_room_messages;
create policy pulse_msgs_send on public.pulse_room_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.pulse_rooms r where r.id = room_id));

-- Joining only bumps the "N in room" count; returns the new count (null when already in or not allowed).
create or replace function public.join_pulse_room(p_room uuid)
returns integer language sql security definer set search_path = public as $$
  update pulse_rooms
     set member_ids = array_append(member_ids, auth.uid())
   where id = p_room and expires_at > now() and auth.uid() is not null
     and not (auth.uid() = any(member_ids)) and cardinality(member_ids) < 500
     and not public.i_am_banned() and not public.blocked_with(creator_id)
  returning cardinality(member_ids)
$$;
revoke all on function public.join_pulse_room(uuid) from public, anon;
grant execute on function public.join_pulse_room(uuid) to authenticated;

alter publication supabase_realtime add table public.pulse_rooms, public.pulse_room_messages;

select cron.schedule('prune-pulse-rooms', '17 * * * *', $$delete from public.pulse_rooms where expires_at < now() - interval '10 minutes'$$);
