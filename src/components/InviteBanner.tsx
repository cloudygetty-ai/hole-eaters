import { useEffect, useState } from 'react'
import { getInviteStats, inviteUrl, type InviteStats } from '../lib/referrals'
import { SPOTLIGHT_GOLD } from './PerkChips'

export interface InviteTheme {
  surf2: string
  surf3: string
  border: string
  accent: string
  dim: string
  font: string
}

const FOUNDER_GOAL = 3 // mirrors my_invite_stats().founder_goal; used until the stats load

function spotlightEnds(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
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
  const url = stats ? inviteUrl(stats.code) : 'https://www.hole-eaters.com/?src=invite'

  const share = async () => {
    const text = `${name ?? 'Someone'} wants you on Hole Eaters — the live cruising map for guys, girls, trans and nonbinary folks.`
    if (navigator.share) {
      await navigator.share({ title: 'Hole Eaters', text, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const invited = stats?.invited ?? 0
  const goal = stats?.founder_goal ?? FOUNDER_GOAL
  const founder = !!stats?.founder
  const spotlightUntil = stats?.spotlight_until ?? null

  return (
    <div style={{ background: theme.surf2, border: `1px solid ${spotlightUntil ? `${SPOTLIGHT_GOLD}66` : theme.border}`, borderRadius: 16, padding: 16, margin: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🔦 Invite people, get the Spotlight</div>
        {invited > 0 && <div style={{ fontSize: 12, color: theme.accent, fontFamily: theme.font }}>{invited} joined</div>}
      </div>
      <div style={{ fontSize: 12, color: theme.dim, marginBottom: 10, lineHeight: 1.5 }}>
        Everyone who joins from your link puts you at the top of the nearby list, with a gold pin on the map, for 24 hours.
        {' '}Bring {goal} and you're a Founding Eater for good.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12 }}>
        {spotlightUntil && (
          <span style={{ color: SPOTLIGHT_GOLD, fontWeight: 700 }}>In the Spotlight until {spotlightEnds(spotlightUntil)}</span>
        )}
        {founder ? (
          <span style={{ color: '#e7b6ff', fontWeight: 700 }}>👑 Founding Eater</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.dim }} aria-label={`${Math.min(invited, goal)} of ${goal} toward Founding Eater`}>
            {Array.from({ length: goal }, (_, i) => (
              <span key={i} aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: i < invited ? SPOTLIGHT_GOLD : theme.surf3, border: `1px solid ${theme.border}` }} />
            ))}
            {Math.min(invited, goal)} of {goal} toward 👑 Founding Eater
          </span>
        )}
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
