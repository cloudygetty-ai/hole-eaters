// Public Supabase client config. Both values ship in every browser bundle by design
// (the anon key is gated by RLS), so a fallback here is safe. It keeps every Vercel
// project that builds this repo working even when its VITE_SUPABASE_* env vars are missing.
const FALLBACK_URL = 'https://xebwdvtaivqjwbwbzdpv.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYndkdnRhaXZxandid2J6ZHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTk2MTAsImV4cCI6MjA4NjUzNTYxMH0.7eTr-Pw-qqrLPfUSpjySZ9PSJ8zbN31XMRax6ChJnb8'

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY
