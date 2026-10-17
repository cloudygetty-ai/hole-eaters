import { useEffect, useState } from 'react'
import { getInviteStats, inviteUrl, type InviteStats } from '../lib/referrals'

export interface InviteTheme {
  surf2: string
  surf3: string
  border: string
  accent: string
  dim: string
  font: string
}

export function InviteBanner({ name, theme }: { name?: string; theme: InviteTheme }) {
  const [stats, setStats] = useState<InviteStats | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    getInviteStats().then(s => { if (alive) setStats(s) })
    return () => { alive = false }
  }, [])

  // Without a code (offline, guest race) fall back to the bare landing link; it still converts.
  const url = stats ? inviteUrl(stats.code) : 'https://www.hole-eaters.com/?utm_source=invite'

  const share = async () => {
    const text = `${name ?? 'Someone'} wants you on Hole Eaters — the live cruising map for guys.`
    if (navigator.share) {
      await navigator.share({ title: 'Hole Eaters', text, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const invited = stats?.invited ?? 0

  return (
    <div style={{ background: theme.surf2, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16, margin: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🔗 Invite guys nearby</div>
        {invited > 0 && <div style={{ fontSize: 12, color: theme.accent, fontFamily: theme.font }}>{invited} joined</div>}
      </div>
      <div style={{ fontSize: 12, color: theme.dim, marginBottom: 12, lineHeight: 1.5 }}>
        A busier map means more matches for you. Everyone who joins from your link counts toward your invites.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, background: theme.surf3, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: theme.dim, fontFamily: theme.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {url.replace('https://', '')}
        </div>
        <button onClick={share} style={{ padding: '8px 16px', borderRadius: 8, background: theme.accent, color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
          {copied ? '✓ Copied' : 'Share'}
        </button>
      </div>
    </div>
  )
}
