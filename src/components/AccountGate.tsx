import type { VideoTheme } from './VideoFeed'

// Shown in place of a members-only screen for sessions without an account.
// The limit itself is enforced in the database; this only explains it and offers the way in.
export function AccountGate({ theme: t, title, body, onCreate }: { theme: VideoTheme; title: string; body: string; onCreate: () => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, textAlign: 'center', background: t.bg, color: t.text }}>
      <div aria-hidden style={{ fontSize: 34 }}>🔐</div>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
      <div style={{ fontSize: 13, color: t.muted, maxWidth: 280, lineHeight: 1.5 }}>{body}</div>
      <button type="button" onClick={onCreate}
        style={{ marginTop: 8, padding: '11px 22px', borderRadius: 22, border: 'none', background: t.accent, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
        Create account
      </button>
    </div>
  )
}
