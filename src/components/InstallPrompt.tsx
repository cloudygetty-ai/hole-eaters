import { useEffect, useState } from 'react'

// Reminds people to add Hole Eaters to their Home Screen, the only way iPhone delivers notifications to a web app.
// iPhone has no install API, so it gets step-by-step instructions; Android uses the browser's install prompt when offered.

type Platform = 'ios-safari' | 'ios-other' | 'in-app' | 'android' | 'desktop'

export interface InstallTheme { accent: string; surface: string; surf3: string; border: string; text: string; muted: string; dim: string }

const SNOOZE_KEY = 'he_install_snooze_until'
const DAY = 24 * 60 * 60 * 1000

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (/FBAN|FBAV|Instagram|Snapchat|TikTok|Twitter|Line\/|GSA\/|Grindr/i.test(ua)) return 'in-app'
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function snoozed(): boolean {
  try { return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now() } catch { return false }
}
function snooze(days: number) {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * DAY)) } catch { /* private mode */ }
}

const ShareIcon = ({ color }: { color: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)
const AddIcon = ({ color }: { color: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
)

/**
 * Bottom-sheet reminder. Appears `delayMs` after mount unless installed or snoozed.
 * `open` forces it open (e.g. from the Notifications row); `onClose` fires when it closes.
 */
export function InstallPrompt({ theme: t, delayMs = 12000, open, onClose }: { theme: InstallTheme; delayMs?: number; open?: boolean; onClose?: () => void }) {
  const [platform] = useState<Platform>(detectPlatform)
  const [installEvent, setInstallEvent] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallEvent(e as unknown as typeof installEvent) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (isStandalone() || platform === 'desktop' || snoozed()) return
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [platform, delayMs])

  useEffect(() => { if (open && !isStandalone()) setVisible(true) }, [open])

  const close = (days: number) => { snooze(days); setVisible(false); onClose?.() }
  if (!visible) return null

  const step = (n: number, icon: React.ReactNode, title: React.ReactNode, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${t.accent}22`, color: t.accent, fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: t.surf3, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )

  const appIcon = <img src="/icons/icon-192.png" alt="" width={30} height={30} style={{ borderRadius: 7 }} />

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 950, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <style>{`@keyframes he-nudge { 0%,100% { transform: translateY(0) } 50% { transform: translateY(8px) } }`}</style>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => close(3)} />
      <div role="dialog" aria-label="Add Hole Eaters to your Home Screen" style={{ position: 'relative', background: t.surface, borderTop: `1px solid ${t.accent}44`, borderRadius: '22px 22px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'slideUp 0.25s ease' }}>
        <button aria-label="Remind me later" onClick={() => close(3)} style={{ position: 'absolute', top: 14, right: 16, color: t.dim, fontSize: 18, padding: 4 }}>✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          {appIcon}
          <div style={{ fontWeight: 800, fontSize: 18, color: t.text }}>Make it an app</div>
        </div>
        <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.5, marginBottom: 8 }}>
          Add Hole Eaters to your Home Screen to get notifications for likes, taps and messages, and open it full screen like a real app.
        </div>

        {platform === 'in-app' && (
          <>
            {step(1, <span style={{ fontSize: 18 }}>⋯</span>, 'Open this page in your browser', 'Tap the ⋯ menu, then "Open in Safari" or "Open in Chrome"')}
            {step(2, <ShareIcon color={t.accent} />, 'Then tap Share → Add to Home Screen')}
          </>
        )}

        {(platform === 'ios-safari' || platform === 'ios-other') && (
          <>
            {step(1, <ShareIcon color={t.accent} />, <>Tap the <span style={{ color: t.accent }}>Share</span> button</>,
              platform === 'ios-safari' ? 'The square with an arrow, at the bottom of Safari' : 'The square with an arrow, next to the address bar')}
            {step(2, <AddIcon color={t.accent} />, <>Choose <span style={{ color: t.accent }}>Add to Home Screen</span></>, 'Scroll down the menu if you don’t see it')}
            {step(3, appIcon, 'Open Hole Eaters from your Home Screen', 'Then turn on notifications in Me')}
          </>
        )}

        {platform === 'android' && (installEvent ? (
          <button onClick={async () => { installEvent.prompt(); const { outcome } = await installEvent.userChoice; if (outcome === 'accepted') close(365) }}
            style={{ width: '100%', marginTop: 8, padding: '14px', borderRadius: 14, background: t.accent, color: '#fff', fontWeight: 800, fontSize: 15 }}>
            Install the app
          </button>
        ) : (
          <>
            {step(1, <span style={{ fontSize: 20, color: t.accent }}>⋮</span>, 'Tap the ⋮ menu', 'Top-right corner of Chrome')}
            {step(2, <AddIcon color={t.accent} />, <>Choose <span style={{ color: t.accent }}>Install app</span> or <span style={{ color: t.accent }}>Add to Home screen</span></>)}
          </>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => close(30)} style={{ flex: 1, padding: '12px', borderRadius: 12, background: t.surf3, border: `1px solid ${t.border}`, color: t.text, fontWeight: 700, fontSize: 14 }}>I’ve added it</button>
          <button onClick={() => close(3)} style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'transparent', border: `1px solid ${t.border}`, color: t.dim, fontWeight: 600, fontSize: 14 }}>Remind me later</button>
        </div>

        {platform === 'ios-safari' && (
          <div aria-hidden style={{ position: 'fixed', bottom: 6, left: '50%', marginLeft: -14, fontSize: 26, color: t.accent, animation: 'he-nudge 1.2s ease-in-out infinite', pointerEvents: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>↓</div>
        )}
      </div>
    </div>
  )
}
