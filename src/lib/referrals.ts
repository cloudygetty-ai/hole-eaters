// Invite attribution. Contract: public.claim_referral(p_code) / public.my_invite_stats() in Supabase.
import { supabase } from './supabase'

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
