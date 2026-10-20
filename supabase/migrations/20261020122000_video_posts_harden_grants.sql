-- Advisor follow-up: video tables are signed-in only; writes go through the edge function (service role).
-- Trigger function must not be callable as an RPC.
revoke all on public.videos, public.video_performers, public.video_reports, public.creator_verifications from anon;
revoke insert, update, truncate, references, trigger on public.videos, public.video_performers, public.creator_verifications from authenticated;
revoke update, delete, truncate, references, trigger on public.video_reports from authenticated;
revoke execute on function public.on_video_report() from public, anon, authenticated;
