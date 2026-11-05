-- Profile "Anthem": user-pasted music link, rendered client-side as a plain outbound link card.
-- No provider API/embed (keeps us outside Spotify/Apple developer + widget terms).
-- Already applied to production on 2026-11-05; idempotent for local/branch replays.
alter table public.profiles add column if not exists anthem_url text;

alter table public.profiles drop constraint if exists profiles_anthem_safe;
alter table public.profiles add constraint profiles_anthem_safe check (
  anthem_url is null or (
    char_length(anthem_url) <= 300
    and anthem_url ~ '^https://(open\.spotify\.com|music\.apple\.com|soundcloud\.com|on\.soundcloud\.com|(www\.|m\.|music\.)?youtube\.com|youtu\.be|[a-z0-9-]+\.bandcamp\.com|(listen\.)?tidal\.com)/[A-Za-z0-9/_.~%?=&+-]*$'
  )
);

comment on column public.profiles.anthem_url is 'User-pasted music link (Spotify/Apple Music/SoundCloud/YouTube/Bandcamp/Tidal). Rendered as a link card; no third-party API or embed.';

-- profiles uses column-level SELECT grants; new public columns must be granted explicitly.
grant select (anthem_url) on public.profiles to authenticated;
