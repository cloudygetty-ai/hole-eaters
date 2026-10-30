-- End-to-end encrypted 1:1 chats.
-- Each browser/phone makes an ECDH P-256 key pair; the private key never leaves the device (WebCrypto,
-- non-extractable, IndexedDB). Only public keys are stored here. Every message is sealed with a fresh
-- AES-256-GCM key, wrapped for each of the two people's devices. The database only ever sees ciphertext.

create table if not exists public.user_keys (
  device_id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  public_key jsonb not null check (
    public_key->>'kty' = 'EC' and public_key->>'crv' = 'P-256'
    and public_key ? 'x' and public_key ? 'y' and not public_key ? 'd'   -- never a private key
    and octet_length(public_key::text) < 512),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists user_keys_user_idx on public.user_keys (user_id);
alter table public.user_keys enable row level security;

-- Public keys are public to signed-in people (needed to encrypt to someone); only you add/remove yours
create policy user_keys_read on public.user_keys for select to authenticated using (true);
create policy user_keys_add_own on public.user_keys for insert to authenticated with check (user_id = auth.uid());
create policy user_keys_touch_own on public.user_keys for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_keys_remove_own on public.user_keys for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.user_keys to authenticated;
grant update (last_seen_at) on public.user_keys to authenticated;

-- At most 10 devices per person (keeps per-message key lists small and stops key-spam)
create or replace function public.limit_user_keys() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from user_keys where user_id = new.user_id) >= 10 then
    delete from user_keys where device_id = (select device_id from user_keys where user_id = new.user_id order by last_seen_at asc limit 1);
  end if;
  return new;
end $$;
create trigger limit_user_keys before insert on public.user_keys for each row execute function public.limit_user_keys();
revoke execute on function public.limit_user_keys() from public, anon, authenticated;

-- Encrypted payload: { v: 1, sd: sender device, iv, ct, k: { deviceId: wrappedKey } }
alter table public.messages add column if not exists enc jsonb;
alter table public.messages add constraint messages_enc_shape check (
  enc is null or (
    (enc->>'v') = '1' and enc ? 'sd' and enc ? 'iv' and enc ? 'ct' and jsonb_typeof(enc->'k') = 'object'
    and octet_length(enc::text) <= 65536));

-- Encrypted files are opaque bytes
update storage.buckets set allowed_mime_types = array_append(allowed_mime_types, 'application/octet-stream')
  where id = 'chat' and not ('application/octet-stream' = any(allowed_mime_types));

-- Read receipts only: the sealed payload can't be edited either
create or replace function public.messages_only_read_receipts() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.content is distinct from old.content or new.media_url is distinct from old.media_url
    or new.media_type is distinct from old.media_type or new.sender_id is distinct from old.sender_id
    or new.match_id is distinct from old.match_id or new.created_at is distinct from old.created_at
    or new.enc is distinct from old.enc) then
    raise exception 'messages can only be marked as read' using errcode = '42501';
  end if;
  return new;
end $$;
