// Paid-ad signup attribution. Contract: public.record_signup_attribution(...) in Supabase.
// go.html (and index.html) store the last ad touch in localStorage; this ships it once a profile exists.
import { supabase } from './supabase'

const ATTR_KEY = 'he_attr'
const ATTR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

interface StoredAttribution {
  source: string
  medium: string | null
  campaign: string | null
  content: string | null
  click_id: string | null
  landed_at: string
}

// Networks that fail to expand a macro send it literally (e.g. "{click_id}"); that is not an id.
function realClickId(value: string | null): string | null {
  return value && !/[{}]/.test(value) ? value : null
}

function readStored(): StoredAttribution | null {
  try {
    const raw = localStorage.getItem(ATTR_KEY)
    if (!raw) return null
    const attr = JSON.parse(raw) as StoredAttribution
    const age = Date.now() - Date.parse(attr.landed_at)
    if (!attr.source || !(age >= 0 && age < ATTR_WINDOW_MS)) return null
    return attr
  } catch {
    return null
  }
}

// Fire-and-forget after a new profile is saved. Server enforces: once per profile, profile < 24h old.
export async function recordStoredAttribution(): Promise<void> {
  const attr = readStored()
  if (!attr) return
  const { error } = await supabase.rpc('record_signup_attribution', {
    p_source: attr.source,
    p_medium: attr.medium,
    p_campaign: attr.campaign,
    p_content: attr.content,
    p_click_id: realClickId(attr.click_id),
    p_landed_at: attr.landed_at,
  })
  if (error) {
    // Keep the touch so the next profile save retries; the RPC is idempotent.
    console.warn('[attribution] record failed', error.message)
    return
  }
  try { localStorage.removeItem(ATTR_KEY) } catch { /* noop */ }
}
