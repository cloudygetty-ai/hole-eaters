import { useEffect, useMemo, useState } from 'react'
import { dispatchInApp } from './push'
import { getInvitePerks, getInviteStats, type InvitePerk } from './referrals'

const REFRESH_MS = 5 * 60_000 // Spotlights end on the hour they were earned; 5 min drift is fine
const SEEN_KEY = 'he_invites_seen'

/** Spotlight / Founding Eater flags for the profiles on screen. Refetches when the set of ids changes. */
export function useInvitePerks(ids: string[]): Map<string, InvitePerk> {
  const [perks, setPerks] = useState<Map<string, InvitePerk>>(() => new Map())
  const key = useMemo(() => [...ids].sort().join(','), [ids])

  useEffect(() => {
    if (!key) { setPerks(new Map()); return }
    let alive = true
    const load = () => getInvitePerks(key.split(',')).then(p => { if (alive) setPerks(p) })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [key])

  return perks
}

/** Once per app open: if people joined from my link since last time, say so (the reward is useless unnoticed). */
export function useInviteRewardNotice(userId: string | undefined, hasProfile: boolean) {
  useEffect(() => {
    if (!userId || !hasProfile) return
    let alive = true
    getInviteStats().then(stats => {
      if (!alive || !stats) return
      const seenKey = `${SEEN_KEY}_${userId}`
      const seen = Number(localStorage.getItem(seenKey) ?? stats.invited)
      localStorage.setItem(seenKey, String(stats.invited))
      const fresh = stats.invited - seen
      if (fresh <= 0) return
      const who = fresh === 1 ? 'Someone joined' : `${fresh} people joined`
      const until = stats.spotlight_until ? new Date(stats.spotlight_until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null
      dispatchInApp(`🔦 ${who} from your link`, until ? `You're in the Spotlight until ${until}.` : 'Thanks for bringing people in.', 'invite-reward')
    }).catch(() => { /* storage blocked or offline: skip the notice */ })
    return () => { alive = false }
  }, [userId, hasProfile])
}
