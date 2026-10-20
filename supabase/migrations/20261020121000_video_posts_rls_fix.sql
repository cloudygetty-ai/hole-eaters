-- videos_read <-> vp_read referenced each other's tables under RLS (42P17 infinite recursion).
-- Ownership/tag checks move into SECURITY DEFINER helpers so neither policy re-enters the other.

create or replace function public.is_video_performer(vid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from video_performers where video_id = vid and performer_id = auth.uid());
$$;

create or replace function public.is_video_uploader(vid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from videos where id = vid and uploader_id = auth.uid());
$$;

revoke execute on function public.is_video_performer(uuid) from public, anon;
revoke execute on function public.is_video_uploader(uuid) from public, anon;
grant execute on function public.is_video_performer(uuid) to authenticated;
grant execute on function public.is_video_uploader(uuid) to authenticated;

alter policy videos_read on public.videos using (
  uploader_id = (select auth.uid())
  or public.is_admin()
  or (status = 'approved' and public.video_all_consented(id))
  or public.is_video_performer(id)
);

alter policy vp_read on public.video_performers using (
  performer_id = (select auth.uid())
  or public.is_admin()
  or public.is_video_uploader(video_id)
);
