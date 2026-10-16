# The Hole Eaters

Location-based proximity app. PWA.

## Stack
- React 18 + TypeScript + Vite
- Supabase (auth, realtime, PostGIS, storage)
- Deploy: Vercel

## Supabase
- Project: `xebwdvtaivqjwbwbzdpv`
- Tables: profiles, likes, matches, messages, icebreakers, vibe_checks
- PostGIS: nearby_users() RPC
- Realtime: messages channel, presence channel
- Storage: `media` bucket (public)

## Dev
```bash
pnpm install && pnpm dev
```

## Routes
- `/` — static landing (`index.html`, `src/landing/`): SEO/OG, native-app waitlist. Members with a session, installed PWAs, and auth callbacks are forwarded to `/app` before paint; `/?home` forces the landing.
- `/app` — the React PWA (`app.html`, `src/main.tsx`).

## Growth
- Waitlist + referrals: `supabase/migrations/20261016200000_growth_waitlist_referrals.sql`
- Venue QR stickers: `python3 scripts/qr_stickers.py <venue-slug>... --out stickers.pdf`
- Playbook: `docs/growth/launch-kit.md`
