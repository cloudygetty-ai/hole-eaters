import { useEffect, useState } from 'react'
import { locationPlatform } from '../lib/goLive'

// Location-blocked help and the Go Live pill. Logic lives in lib/goLive.ts.

export interface LiveTheme { surface: string; surf2: string; surf3: string; border2: string; text: string; muted: string; dim: string; accent: string; green: string }

const STEPS: Record<ReturnType<typeof locationPlatform>, { title: string; steps: string[] }> = {
  'ios-app': {
    title: 'iPhone (home screen app)',
    steps: [
      'Open the Settings app.',
      'Go to Privacy & Security → Location Services and make sure it’s on.',
      'Scroll down to Safari Websites and choose “While Using the App”.',
      'Come back here and tap Try again. If it still says blocked, delete and re-add the home screen icon.',
    ],
  },
  'ios-safari': {
    title: 'iPhone Safari',
    steps: [
      'Tap the “aA” (or page) icon on the left of the address bar.',
      'Tap Website Settings → Location → Allow.',
      'If Location isn’t listed: Settings app → Privacy & Security → Location Services → Safari Websites → While Using the App.',
      'Come back here and tap Try again.',
    ],
  },
  android: {
    title: 'Android Chrome',
    steps: [
      'Tap the icon on the left of the address bar (or ⋮ → Settings → Site settings if you installed the app).',
      'Tap Permissions → Location → Allow.',
      'Make sure phone location is on: pull down quick settings and turn on Location.',
      'Come back here and tap Try again.',
    ],
  },
  desktop: {
    title: 'Computer browser',
    steps: [
      'Click the icon on the left of the address bar.',
      'Set Location to Allow.',
      'Reload the page or tap Try again.',
    ],
  },
}

/** Slim banner shown while location is blocked; opens step-by-step help. */
export function LocationBlockedBanner({ theme: t, status, onRetry }: { theme: LiveTheme; status: 'denied' | 'unavailable'; onRetry: () => void }) {
  const [open, setOpen] = useState(false)
  const help = STEPS[locationPlatform()]
  return (
    <>
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.35)', fontSize: 12, color: t.text, flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>📍</span>
        <span style={{ flex: 1 }}>{status === 'denied' ? 'Location is blocked, so nobody nearby can see you.' : 'Couldn’t get your location.'}</span>
        {status === 'denied'
          ? <button onClick={() => setOpen(true)} style={{ padding: '6px 11px', borderRadius: 9, background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 12 }}>Fix it</button>
          : <button onClick={onRetry} style={{ padding: '6px 11px', borderRadius: 9, background: t.surf3, color: t.text, fontWeight: 700, fontSize: 12 }}>Try again</button>}
      </div>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 880, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Turn location back on" onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: t.surface, borderRadius: '22px 22px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', borderTop: `1px solid ${t.border2}` }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 4 }}>Turn location back on</div>
            <div style={{ fontSize: 13, color: t.muted, marginBottom: 14 }}>{help.title} · Your exact spot is never shown, only rough distance.</div>
            <ol style={{ margin: '0 0 18px', paddingLeft: 20, color: t.text, fontSize: 14, lineHeight: 1.5 }}>
              {help.steps.map(s => <li key={s} style={{ marginBottom: 8 }}>{s}</li>)}
            </ol>
            <button onClick={() => { setOpen(false); onRetry() }} style={{ width: '100%', padding: 14, borderRadius: 14, background: t.accent, color: '#fff', fontWeight: 800, fontSize: 15 }}>Try again</button>
          </div>
        </div>
      )}
    </>
  )
}

/** Map pill: tap to go live / end live. */
export function GoLiveButton({ theme: t, live, endsAt, onToggle }: { theme: LiveTheme; live: boolean; endsAt: number | null; onToggle: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [live])
  const mins = endsAt ? Math.max(0, Math.round((endsAt - Math.max(now, endsAt - 2 * 60 * 60_000)) / 60_000)) : 0
  return (
    <button onClick={onToggle} aria-pressed={live} aria-label={live ? 'End Live mode' : 'Go Live'}
      title={live ? 'Screen stays on and your location stays fresh. Tap to end.' : 'Keep the screen on and your location fresh while you’re out'}
      style={{ position: 'absolute', left: 14, bottom: 'calc(76px + env(safe-area-inset-bottom))', zIndex: 30, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', borderRadius: 16,
        background: live ? 'rgba(239,68,68,0.18)' : 'rgba(0,0,0,0.7)', border: `1px solid ${live ? '#ef4444' : t.border2}`, color: live ? '#fff' : t.text, fontWeight: 800, fontSize: 12, backdropFilter: 'blur(10px)' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: live ? '#ef4444' : t.dim, boxShadow: live ? '0 0 10px #ef4444' : 'none', animation: live ? 'roomGlow 1.6s infinite' : 'none' }} />
      {live ? `LIVE · ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}` : 'Go Live'}
    </button>
  )
}
