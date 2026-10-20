-- Video posts: open posting for age-verified creators, co-performer consent, report auto-hide.
-- Visibility is derived (status + consent), never stored, so a consent revoke hides a video instantly.

create type public.video_status as enum ('uploading', 'pending_review', 'approved', 'rejected', 'removed');
create type public.verification_status as enum ('none', 'pending', 'verified', 'failed');

-- Written only by the ID-verification provider webhook (service role). Store refs, never ID images.
create table public.creator_verifications (
  user_id      uuid primary key references auth.users on delete cascade,
  status       public.verification_status not null default 'none',
  provider     text,
  provider_ref text,
  verified_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create table public.videos (
  id            uuid primary key default gen_random_uuid(),
  uploader_id   uuid not null references auth.users on delete cascade,
  storage_path  text not null unique,
  caption       text check (char_length(caption) <= 500),
  tags          text[] not null default '{}' check (cardinality(tags) <= 10),
  size_bytes    bigint not null check (size_bytes between 1 and 524288000),
  status        public.video_status not null default 'uploading',
  reject_reason text,
  attested_at   timestamptz not null,
  view_count    bigint not null default 0,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz
);
create index videos_feed_idx on public.videos (approved_at desc) where status = 'approved';
create index videos_review_idx on public.videos (created_at) where status = 'pending_review';
create index videos_tags_gin on public.videos using gin (tags);
create index videos_uploader_idx on public.videos (uploader_id, created_at desc);

create table public.video_performers (
  video_id     uuid not null references public.videos on delete cascade,
  performer_id uuid not null references auth.users on delete cascade,
  consent      text not null default 'pending' check (consent in ('pending', 'granted', 'revoked')),
  responded_at timestamptz,
  primary key (video_id, performer_id)
);
create index video_performers_performer_idx on public.video_performers (performer_id);

create table public.video_reports (
  id          bigserial primary key,
  video_id    uuid not null references public.videos on delete cascade,
  reporter_id uuid not null references auth.users on delete cascade,
  reason      text not null check (reason in ('underage', 'non_consensual', 'illegal', 'spam', 'other')),
  details     text check (char_length(details) <= 1000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (video_id, reporter_id)
);
create index video_reports_open_idx on public.video_reports (video_id) where resolved_at is null;

-- SECURITY DEFINER on purpose: under video_performers RLS, rows hidden from the viewer
-- would read as "no pending consent" and leak unapproved videos.
create or replace function public.video_all_consented(vid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from video_performers where video_id = vid and consent <> 'granted');
$$;

alter table public.creator_verifications enable row level security;
alter table public.videos enable row level security;
alter table public.video_performers enable row level security;
alter table public.video_reports enable row level security;

create policy cv_read_own on public.creator_verifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Writes go through the video-upload edge function (service role). Clients only read/delete own.
create policy videos_read on public.videos for select to authenticated using (
  uploader_id = (select auth.uid())
  or public.is_admin()
  or (status = 'approved' and public.video_all_consented(id))
  or exists (select 1 from public.video_performers p where p.video_id = id and p.performer_id = (select auth.uid()))
);
create policy videos_delete_own on public.videos for delete to authenticated using (uploader_id = (select auth.uid()));

create policy vp_read on public.video_performers for select to authenticated using (
  performer_id = (select auth.uid())
  or public.is_admin()
  or exists (select 1 from public.videos v where v.id = video_id and v.uploader_id = (select auth.uid()))
);

create policy reports_insert on public.video_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_admin_read on public.video_reports for select to authenticated using (public.is_admin());

-- One underage/non-consent report, or 3 open reports of any kind, pulls the video back to review.
create or replace function public.on_video_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reason in ('underage', 'non_consensual')
     or (select count(*) from video_reports where video_id = new.video_id and resolved_at is null) >= 3 then
    update videos set status = 'pending_review' where id = new.video_id and status = 'approved';
  end if;
  return new;
end $$;
create trigger video_report_hide after insert on public.video_reports
  for each row execute function public.on_video_report();

create or replace function public.increment_video_view(vid uuid)
returns void language sql security definer set search_path = public as $$
  update videos set view_count = view_count + 1 where id = vid and status = 'approved';
$$;
revoke execute on function public.increment_video_view(uuid) from public, anon;
grant execute on function public.increment_video_view(uuid) to authenticated;
revoke execute on function public.video_all_consented(uuid) from public, anon;
grant execute on function public.video_all_consented(uuid) to authenticated;

-- Private bucket; objects are served only via short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 524288000, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy videos_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'videos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
    or exists (
      select 1 from public.videos v
      where v.storage_path = name and v.status = 'approved' and public.video_all_consented(v.id)
    )
  )
);
