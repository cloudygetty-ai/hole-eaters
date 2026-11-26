// Shown on the map when nobody nearby is online: an invite nudge, a one-tap "ping me when someone
// shows up", and the next nights at spots nearby. Collapses to a small pill and remembers that.
import { useEffect, useState } from 'react'
import { C as V, F as VF, FX, T as VT } from '../styles/tokens'
import { getInviteStats, inviteUrl, type InviteStats } from '../lib/referrals'
import { clearMapWatch, getMapWatch, setMapWatch } from '../lib/mapWatch'
import { nightWhen, type Night } from '../lib/nights'

export type PushState = 'on' | 'off' | 'blocked' | 'unsupported' | 'ios-install'

const COLLAPSED_KEY = 'he_empty_map_collapsed'
const GOAL = 3

function readCollapsed() { try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false } }
function writeCollapsed(v: boolean) { try { v ? localStorage.setItem(COLLAPSED_KEY, '1') : localStorage.removeItem(COLLAPSED_KEY) } catch { /* private mode */ } }

export function EmptyMapCard({ coords, nights, pushState, onEnablePush, onInstall, onOpenNight }: {
  coords: { lat: number; lng: number } | null
  nights: Night[]
  pushState: PushState
  /** Asks for notification permission and saves this device; resolves when done either way. */
  onEnablePush: () => Promise<void>
  /** iPhone in a Safari tab: web push only works from the Home Screen app. */
  onInstall: () => void
  onOpenNight: (n: Night) => void
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [stats, setStats] = useState<InviteStats | null>(null)
  const [watch, setWatch] = useState<boolean | null>(null) // null = not available, switch hidden
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    getInviteStats().then(s => { if (alive) setStats(s) })
    getMapWatch().then(w => { if (alive) setWatch(w) })
    return () => { alive = false }
  }, [])

  const collapse = (v: boolean) => { writeCollapsed(v); setCollapsed(v) }

  const invited = Math.min(stats?.invited ?? 0, GOAL)
  const share = async () => {
    const url = stats ? inviteUrl(stats.code, 'empty_map') : 'https://www.hole-eaters.com/?utm_source=empty_map'
    const text = 'Join me on Hole Eaters, the live cruising map. The more of us on it, the better it gets.'
    if (navigator.share) { await navigator.share({ title: 'Hole Eaters', text, url }).catch(() => {}); return }
    await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const togglePing = async () => {
    setNote(null)
    if (watch) {
      setBusy(true)
      if (await clearMapWatch()) setWatch(false)
      setBusy(false)
      return
    }
    if (pushState === 'ios-install') { onInstall(); return }
    if (pushState === 'blocked') { setNote('Notifications are blocked for this site. Allow them in your browser settings, then try again.'); return }
    if (pushState === 'unsupported') { setNote("This browser can't get notifications."); return }
    if (!coords) { setNote('Turn location on first so we know where to look.'); return }
    setBusy(true)
    if (pushState === 'off') {
      await onEnablePush()
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') { setBusy(false); return }
    }
    const ok = await setMapWatch(coords.lat, coords.lng)
    setBusy(false)
    if (ok) setWatch(true); else setNote("Couldn't turn that on. Try again.")
  }

  if (collapsed) {
    return (
      <button onClick={() => collapse(false)} aria-label="It's early here. Show invite and nights"
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 31, ...FX.glass, borderRadius: 999, padding: '6px 12px', color: V.brassUp, fontFamily: VF.ui, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        🌙 It's early here
      </button>
    )
  }

  const nextNights = nights.slice(0, 2)
  const pingCopy = watch === null ? 'Invite 3 friends to get the map going.' : "Invite 3 friends and we'll ping you when someone shows up."

  return (
    <section aria-label="It's early here"
      style={{ ...FX.panel, position: 'absolute', left: 12, right: 12, bottom: 'calc(132px + env(safe-area-inset-bottom))', zIndex: 31, maxWidth: 440, margin: '0 auto', border: `1px solid ${V.hairline}`, padding: '16px 16px 14px', color: V.ivory, fontFamily: VF.ui, animation: 'emptyCardIn .5s cubic-bezier(0.22,1,0.36,1) both' }}>
      <style>{'@keyframes emptyCardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...VT.label, marginBottom: 6 }}>It's early here</div>
          <div style={{ fontFamily: VF.display, fontSize: 21, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{pingCopy}</div>
        </div>
        <button aria-label="Hide" onClick={() => collapse(true)} style={{ minWidth: 32, minHeight: 32, color: V.smoke, fontSize: 16 }}>✕</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 12px' }}>
        <div aria-hidden style={{ display: 'flex', gap: 5 }}>
          {Array.from({ length: GOAL }, (_, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < invited ? V.brass : 'transparent', border: `1px solid ${V.brass}` }} />
          ))}
        </div>
        <span style={{ ...VT.data, fontSize: 12 }}>{invited} of {GOAL} joined</span>
        <button onClick={share} style={{ marginLeft: 'auto', minHeight: 36, padding: '8px 14px', borderRadius: 2, background: V.ember, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', boxShadow: FX.emberGlow }}>
          {copied ? '✓ Link copied' : 'Invite friends'}
        </button>
      </div>

      {watch !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${V.hairline}` }}>
          <span aria-hidden style={{ fontSize: 16 }}>🔔</span>
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>
            {watch ? "We'll ping you once when someone shows up nearby." : 'Ping me when someone shows up'}
            {pushState === 'ios-install' && !watch && <span style={{ display: 'block', fontSize: 11, color: V.smoke }}>Add Hole Eaters to your Home Screen first.</span>}
          </span>
          <button role="switch" aria-checked={watch} aria-label="Ping me when someone shows up" disabled={busy} onClick={togglePing}
            style={{ width: 44, height: 24, borderRadius: 12, background: watch ? V.brass : 'rgba(239,230,218,0.12)', border: `1px solid ${watch ? V.brass : V.hairline}`, position: 'relative', flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
            <span style={{ position: 'absolute', top: 2, left: watch ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: V.ivory, transition: 'left .15s' }} />
          </button>
        </div>
      )}
      {note && <div role="status" style={{ fontSize: 12, color: V.brassUp, margin: '2px 0 6px' }}>{note}</div>}

      {nextNights.length > 0 && (
        <div style={{ borderTop: `1px solid ${V.hairline}`, paddingTop: 10 }}>
          <div style={{ ...VT.label, fontSize: 10, marginBottom: 6 }}>Coming up nearby</div>
          {nextNights.map(n => (
            <button key={n.id} onClick={() => onOpenNight(n)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '7px 0', textAlign: 'left', color: V.ivory }}>
              <span aria-hidden>🌙</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: V.smoke, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.spot_name} · {nightWhen(n)}</span>
              </span>
              <span style={{ ...VT.data, fontSize: 11 }}>{n.going} going</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
