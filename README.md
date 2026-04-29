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
