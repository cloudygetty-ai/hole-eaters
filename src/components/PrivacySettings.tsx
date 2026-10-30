import { useState, type ReactNode } from 'react'
import type { Privacy } from '../lib/supabase'
import { lockEnabled, setPin, clearPin } from '../lib/appLock'

// Privacy settings screen. Every switch here is enforced on the server except the startup lock
// (device-only by design) and photo blur (a viewing preference).

export interface PrivacyTheme { bg: string; surface: string; surf2: string; surf3: string; border: string; border2: string; text: string; muted: string; dim: string; accent: string; green: string }

type Key = keyof Privacy

export function PrivacySettings({ theme: t, privacy, notifyPreviews, ghost, onChange, onNotifyPreviews, onGhost, onClose }: {
  theme: PrivacyTheme
  privacy: Privacy
  notifyPreviews: boolean
  ghost: boolean
  onChange: (next: Privacy) => void
  onNotifyPreviews: (on: boolean) => void
  onGhost: (on: boolean) => void
  onClose: () => void
}) {
  const [pinSheet, setPinSheet] = useState(false)
  const [locked, setLocked] = useState(lockEnabled())
  const flip = (k: Key) => onChange({ ...privacy, [k]: !privacy[k] })

  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      style={{ width: 52, height: 30, borderRadius: 15, background: on ? t.green : t.surf3, border: `1px solid ${on ? t.green : t.border2}`, position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 24 : 2, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }} />
    </button>
  )
  const Row = ({ title, sub, on, onClick, last }: { title: string; sub: string; on: boolean; onClick: () => void; last?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: last ? 'none' : `1px solid ${t.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: t.text }}>{title}</div>
        <div style={{ fontSize: 13, color: t.muted, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>
      </div>
      <Toggle on={on} onClick={onClick} label={title} />
    </div>
  )
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: t.muted, margin: '0 4px 8px' }}>{title}</h2>
      <div style={{ background: t.surf2, border: `1px solid ${t.border}`, borderRadius: 18, padding: '2px 18px' }}>{children}</div>
    </section>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 880, background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${t.border}`, background: t.surface }}>
        <button aria-label="Back" onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', background: t.surf3, color: t.text, fontSize: 20 }}>‹</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 800, color: t.text, marginRight: 40 }}>Privacy settings</h1>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 40px' }}>
        <Section title="Visibility">
          <button onClick={() => locked ? (clearPin(), setLocked(false)) : setPinSheet(true)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '14px 0', borderBottom: `1px solid ${t.border}`, textAlign: 'left' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: t.text }}>Startup lock</div>
              <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>{locked ? 'On — PIN asked when the app opens. Tap to turn off.' : 'Ask for a PIN when the app opens'}</div>
            </div>
            <span style={{ color: t.dim, fontSize: 22 }}>›</span>
          </button>
          <Row title="Ghost Mode" sub="Hide yourself from the map and Nearby" on={ghost} onClick={() => onGhost(!ghost)} />
          <Row title="Stealth" sub="Hide your views of other members (no 'checked you out' alerts)" on={!!privacy.stealth} onClick={() => flip('stealth')} last />
        </Section>

        <Section title="Notifications & alerts">
          <Row title="Preview" sub="Hide names and message info in lock-screen alerts" on={!notifyPreviews} onClick={() => onNotifyPreviews(!notifyPreviews)} />
          <Row title="Overnight" sub="No alerts between 10pm and 8am" on={!!privacy.quiet_hours} onClick={() => flip('quiet_hours')} last />
        </Section>

        <Section title="Limit details">
          <Row title="Age" sub="Hide age on your profile" on={!!privacy.hide_age} onClick={() => flip('hide_age')} />
          <Row title="Distance" sub="Hide your distance and map pin from other members" on={!!privacy.hide_distance} onClick={() => flip('hide_distance')} last />
        </Section>

        <Section title="Chats">
          <Row title="Blur photos" sub="Blur photos and videos you receive until you tap them" on={!!privacy.blur_media} onClick={() => flip('blur_media')} />
          <Row title="Video chat" sub="Disable video calls with you" on={!!privacy.video_off} onClick={() => flip('video_off')} last />
        </Section>

        <Section title="Limit insights">
          <Row title="Response" sub="Hide your reply rate from other members" on={!!privacy.hide_response_insight} onClick={() => flip('hide_response_insight')} />
          <Row title="Community" sub="Leave your role and body type out of other people's insights" on={!!privacy.hide_from_community_insights} onClick={() => flip('hide_from_community_insights')} />
          <Row title="Age" sub="Leave your age out of other people's insights" on={!!privacy.hide_from_age_insights} onClick={() => flip('hide_from_age_insights')} last />
        </Section>

        <p style={{ fontSize: 12, color: t.dim, textAlign: 'center', lineHeight: 1.5 }}>
          🔒 Chats are end-to-end encrypted. Your exact location is never shown to anyone.
        </p>
      </div>
      {pinSheet && <PinSetup theme={t} onDone={() => { setPinSheet(false); setLocked(lockEnabled()) }} />}
    </div>
  )
}

function PinSetup({ theme: t, onDone }: { theme: PrivacyTheme; onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null)
  const [pin, setPinValue] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setErr('Use 4–8 digits'); return }
    if (first === null) { setFirst(pin); setPinValue(''); setErr(''); return }
    if (pin !== first) { setErr("PINs didn't match. Start again."); setFirst(null); setPinValue(''); return }
    await setPin(pin); onDone()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 890, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-end' }} onClick={onDone}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: t.surface, borderRadius: '22px 22px 0 0', padding: '22px 20px calc(24px + env(safe-area-inset-bottom))' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 6 }}>{first === null ? 'Choose a PIN' : 'Enter it again'}</div>
        <div style={{ fontSize: 13, color: t.muted, marginBottom: 14 }}>Asked when Hole Eaters opens, and after a minute in the background. Stored only on this phone.</div>
        <input autoFocus inputMode="numeric" type="password" maxLength={8} value={pin} aria-label="PIN"
          onChange={e => setPinValue(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 28, letterSpacing: 10, textAlign: 'center', padding: 12, borderRadius: 14, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text }} />
        <div style={{ color: '#ef4444', fontSize: 12, minHeight: 18, marginTop: 6 }}>{err}</div>
        <button onClick={submit} style={{ width: '100%', padding: 14, borderRadius: 14, background: t.accent, color: '#fff', fontWeight: 800, fontSize: 15 }}>{first === null ? 'Next' : 'Turn on lock'}</button>
      </div>
    </div>
  )
}

/** Full-screen PIN prompt shown over the whole app while locked. */
export function LockScreen({ theme: t, check, onUnlock, onForgot }: { theme: PrivacyTheme; check: (pin: string) => Promise<boolean>; onUnlock: () => void; onForgot: () => void }) {
  const [pin, setPinValue] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const tryPin = async (p: string) => {
    setBusy(true)
    const ok = await check(p)
    setBusy(false)
    if (ok) onUnlock(); else { setErr(true); setPinValue('') }
  }
  return (
    <div role="dialog" aria-label="App locked" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: t.text, marginBottom: 16 }}>Enter your PIN</div>
      <input autoFocus inputMode="numeric" type="password" maxLength={8} value={pin} aria-label="PIN" disabled={busy}
        onChange={e => { setErr(false); setPinValue(e.target.value.replace(/\D/g, '')) }} onKeyDown={e => e.key === 'Enter' && tryPin(pin)}
        style={{ width: 220, fontSize: 28, letterSpacing: 10, textAlign: 'center', padding: 12, borderRadius: 14, background: t.surf3, border: `1px solid ${err ? '#ef4444' : t.border2}`, color: t.text }} />
      <div style={{ color: '#ef4444', fontSize: 13, minHeight: 20, marginTop: 8 }}>{err ? 'Wrong PIN' : ''}</div>
      <button onClick={() => tryPin(pin)} disabled={busy || pin.length < 4} style={{ width: 220, padding: 13, borderRadius: 14, background: t.accent, color: '#fff', fontWeight: 800, opacity: pin.length < 4 ? 0.5 : 1 }}>Unlock</button>
      <button onClick={onForgot} style={{ marginTop: 18, color: t.dim, fontSize: 13 }}>Forgot PIN? Sign out</button>
    </div>
  )
}
