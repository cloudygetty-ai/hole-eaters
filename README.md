# 🍑 The Hole Eaters

Location-based anonymous hookup map PWA. Built with React + Vite.

## Features

- **Map View** — GPS pins with video/emoji avatars, heatmap, zoom, distance rings
- **Video Profile Avatars** — Upload a looping video clip as your profile pic; renders on map pins, list cards, and profile drawer
- **AI Cruising Radar** — Proximity sonar, predicted heat timeline, AI-generated icebreakers, ghost mode, "who's checking you" tracker
- **Chat** — Inline messaging with image/video sharing, typing indicator, auto-replies
- **Video Room** — WebRTC group video with mute/cam toggle, live timer
- **Vibe Check** — Algorithmic compatibility scoring per user
- **Matches View** — Grid of liked users
- **Ghost Mode** — Browse invisibly without appearing on the map
- **PWA** — Installable, offline-capable, standalone mobile experience

## Quick Start

```bash
git clone https://github.com/cloudygetty-ai/hole-eaters.git
cd hole-eaters
npm install
npm run dev
```

Open `http://localhost:3000`

## Deploy

### Vercel (recommended)

```bash
npm i -g vercel
vercel
```

Or connect the GitHub repo at [vercel.com/new](https://vercel.com/new) — auto-detects Vite.

### Railway

```bash
railway login
railway init
railway up
```

### Manual

```bash
npm run build
# Serve the `dist/` folder with any static host
npx serve dist
```

## Environment Variables

None required for the demo. For production:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API endpoint |
| `VITE_MAPBOX_TOKEN` | Mapbox GL integration (future) |
| `VITE_LIVEKIT_URL` | LiveKit WebRTC server |
| `VITE_ANTHROPIC_KEY` | Claude API for AI icebreakers |

## Tech Stack

- React 18 + Vite 6
- WebRTC (`getUserMedia`) for video
- Service Worker for offline/PWA
- CSS-in-JS (inline styles, zero deps)
- JetBrains Mono + Syne typography

## File Structure

```
hole-eaters/
├── index.html          # Vite entrypoint
├── package.json
├── vite.config.js
├── vercel.json         # Vercel SPA routing
├── public/
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service worker
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
└── src/
    ├── main.jsx        # React DOM mount + SW registration
    └── App.jsx         # Full application
```

## License

Proprietary — cloudygetty-ai
