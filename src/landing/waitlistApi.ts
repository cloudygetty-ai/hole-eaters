// Waitlist contract — mirrors public.join_waitlist / public.waitlist_status in Supabase.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabasePublic'

export interface WaitlistStatus {
  code: string
  position: number
  total: number
  referrals: number
  priority: boolean
  needed: number
}

export type JoinResponse =
  | ({ status: 'joined' } & WaitlistStatus)
  | { status: 'exists' }
  | { status: 'invalid_email' }
  | { status: 'error' }

export interface JoinRequest {
  email: string
  city: string
  platform: string
  ref: string | null
  source: string
}

const URL_BASE = SUPABASE_URL
const ANON_KEY = SUPABASE_ANON_KEY

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      console.error(`[waitlist] ${fn} failed`, res.status, await res.text().catch(() => ''))
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[waitlist] ${fn} unreachable`, err)
    return null
  }
}

export async function joinWaitlist(req: JoinRequest): Promise<JoinResponse> {
  const data = await rpc<JoinResponse>('join_waitlist', {
    p_email: req.email,
    p_city: req.city || null,
    p_platform: req.platform,
    p_ref: req.ref,
    p_source: req.source,
  })
  return data ?? { status: 'error' }
}

export async function getWaitlistStatus(code: string): Promise<WaitlistStatus | null> {
  return rpc<WaitlistStatus>('waitlist_status', { p_code: code })
}
