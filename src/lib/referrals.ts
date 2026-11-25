// Invite attribution. Contract: public.claim_referral(p_code) / public.my_invite_stats() in Supabase.
import { supabase } from './supabase'
import { storedSrc } from './promo'

const REF_KEY = 'he_ref'
export const SITE_URL = 'https://www.hole-eaters.com'

export interface InviteStats {
  code: string
  invited: number
}

export function inviteUrl(code: string, source = 'invite') {
  return `${SITE_URL}/?ref=${encodeURIComponent(code)}&utm_source=${source}`
}

// The landing page stores ?ref= before the app loads; read it here too for direct /app?ref= links.
function storedRef(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ref')
    if (fromUrl && /^[a-z0-9_-]{4,24}$/i.test(fromUrl)) return fromUrl.toLowerCase()
    return localStorage.getItem(REF_KEY)
  } catch {
    return null
  }
}

// Fire-and-forget after a new profile is saved. Server enforces: once, not self, profile < 24h old.
export async function claimStoredReferral(): Promise<void> {
  const code = storedRef()
  if (!code) return
  const { error } = await supabase.rpc('claim_referral', { p_code: code })
  if (error) {
    console.warn('[referrals] claim failed', error.message)
    return
  }
  try { localStorage.removeItem(REF_KEY) } catch { /* noop */ }
}

export async function getInviteStats(): Promise<InviteStats | null> {
  const { data, error } = await supabase.rpc('my_invite_stats')
  if (error) {
    console.warn('[referrals] stats failed', error.message)
    return null
  }
  return (data as InviteStats | null) ?? null
}

// Fire-and-forget with claimStoredReferral: tags the new profile with the poster/ad it came from.
// Server enforces: once, profile < 24h old.
export async function claimSignupSource(): Promise<void> {
  const src = storedSrc()
  if (!src) return
  const { error } = await supabase.rpc('claim_signup_source', { p_src: src })
  if (error) console.warn('[promo] source claim failed', error.message)
}

export interface PromoStat { src: string; visitors: number; signups: number }
export async function getPromoStats(days = 90): Promise<PromoStat[]> {
  const { data, error } = await supabase.rpc('promo_stats', { days })
  return error || !Array.isArray(data) ? [] : (data as PromoStat[])
}
