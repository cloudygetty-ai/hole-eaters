-- Every profile video also appears on the Videos page, live immediately (operator decision 2026-11-07).
-- Chat videos are E2EE and never included. Feed posts keep their verification + review flow.
-- Kept in sync by a trigger on profiles.video_url so no client path can skip it.

alter table public.videos add column if not exists source text not null default 'post';
alter table public.videos drop constraint if exists videos_source_check;
alter table public.videos add constraint videos_source_check check (source in ('post', 'profile'));

-- Profile videos never went through the posting attestation, so don't pretend they did.
alter table public.videos alter column attested_at drop not null;
alter table public.videos drop constraint if exists videos_attested_for_posts;
alter table public.videos add constraint videos_attested_for_posts check (source = 'profile' or attested_at is not null);

create index if not exists videos_feed_idx on public.videos (approved_at desc) where status = 'approved';

-- media public URL -> object path inside the media bucket (null if it isn't one of ours)
create or replace function public.media_path_from_url(u text) returns text
language sql immutable set search_path = public as $$
  select substring(u from '^https://xebwdvtaivqjwbwbzdpv\.supabase\.co/storage/v1/object/public/media/(.+)$')
$$;

create or replace function public.sync_profile_video() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text;
  sz bigint;
  made timestamptz;
begin
  if tg_op = 'UPDATE' and new.video_url is not distinct from old.video_url then
    return new;
  end if;

  -- One feed entry per profile video: drop the previous one when it changes or is cleared.
  delete from videos where uploader_id = new.id and source = 'profile';

  p := media_path_from_url(new.video_url);
  if p is null then
    return new;
  end if;

  select (o.metadata->>'size')::bigint, o.created_at into sz, made
    from storage.objects o where o.bucket_id = 'media' and o.name = p;

  insert into videos (uploader_id, storage_path, source, status, approved_at, size_bytes, created_at)
  values (new.id, p, 'profile', 'approved', coalesce(made, now()), greatest(coalesce(sz, 1), 1), coalesce(made, now()))
  on conflict (storage_path) do nothing;

  return new;
end $$;

drop trigger if exists profiles_sync_video on public.profiles;
create trigger profiles_sync_video
  after insert or update of video_url on public.profiles
  for each row execute function public.sync_profile_video();

-- Backfill existing profile videos (re-running is a no-op thanks to the unique storage_path).
insert into videos (uploader_id, storage_path, source, status, approved_at, size_bytes, created_at)
select pr.id, public.media_path_from_url(pr.video_url), 'profile', 'approved',
       coalesce(o.created_at, pr.updated_at, now()),
       greatest(coalesce((o.metadata->>'size')::bigint, 1), 1),
       coalesce(o.created_at, pr.updated_at, now())
from profiles pr
left join storage.objects o on o.bucket_id = 'media' and o.name = public.media_path_from_url(pr.video_url)
where public.media_path_from_url(pr.video_url) is not null
on conflict (storage_path) do nothing;
