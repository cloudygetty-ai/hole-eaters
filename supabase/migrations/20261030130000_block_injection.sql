-- Block injection at the database: whatever a client sends, only safe shapes get stored.
-- Existing data already satisfies every rule (checked 2026-10-30), so constraints are validated.

-- Media links may only point at our own storage (or the built-in sticker set). Stops tracking pixels,
-- `javascript:`/`data:` URLs and links to other sites from ever being saved.
create or replace function public.is_own_media_url(u text) returns boolean
language sql immutable set search_path = public as $$
  select u is null
      or u ~ '^https://xebwdvtaivqjwbwbzdpv\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9._/ %()+=,@-]+$'
      or u ~ '^/stickers/[a-z0-9-]+\.webp$'
$$;

-- Invisible and direction-override characters (used to disguise names and links) plus raw control characters.
create or replace function public.has_unsafe_chars(t text) returns boolean
language sql immutable set search_path = public as $$
  -- Zero-width joiner (U+200D) stays allowed: combined emojis like the rainbow flag need it
  select t ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]'
$$;

alter table public.profiles
  add constraint profiles_name_safe check (name is null or (char_length(name) <= 50 and not public.has_unsafe_chars(name))),
  add constraint profiles_bio_safe check (bio is null or (char_length(bio) <= 1000 and not public.has_unsafe_chars(bio))),
  add constraint profiles_status_safe check (cruising_status is null or (char_length(cruising_status) <= 100 and not public.has_unsafe_chars(cruising_status))),
  add constraint profiles_tags_safe check (tags is null or (cardinality(tags) <= 20 and char_length(array_to_string(tags, '')) <= 600 and not public.has_unsafe_chars(array_to_string(tags, ' ')))),
  add constraint profiles_media_own check (public.is_own_media_url(photo_url) and public.is_own_media_url(video_url)),
  add constraint profiles_details_safe check (details is null or (octet_length(details::text) <= 16384 and public.is_own_media_url(details->>'cover_url'))),
  add constraint profiles_emoji_safe check (emoji is null or char_length(emoji) <= 8),
  add constraint profiles_color_safe check (color is null or color ~ '^#[0-9a-fA-F]{3,8}$');

alter table public.messages
  add constraint messages_content_safe check (content is null or (char_length(content) <= 4000 and not public.has_unsafe_chars(content))),
  add constraint messages_media_own check (public.is_own_media_url(media_url)),
  add constraint messages_media_type_ok check (media_type is null or media_type in ('image', 'video', 'audio', 'sticker'));

alter table public.global_messages
  add constraint global_content_safe check (content is null or (char_length(content) <= 1000 and not public.has_unsafe_chars(content))),
  add constraint global_media_own check (public.is_own_media_url(media_url));

alter table public.reviews
  add constraint reviews_body_chars check (body is null or not public.has_unsafe_chars(body));
alter table public.reports
  add constraint reports_details_safe check (details is null or (char_length(details) <= 2000 and not public.has_unsafe_chars(details)));
