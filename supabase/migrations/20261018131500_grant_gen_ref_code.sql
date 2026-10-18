-- Profiles and waitlist default ref_code to gen_ref_code(), but the 2026-10-16 growth migration only granted
-- EXECUTE to service_role, so every new profile save from the app failed with "permission denied" (403).
-- Applied manually 2026-10-18.
grant execute on function public.gen_ref_code() to anon, authenticated;
