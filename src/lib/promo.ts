// Promo source tracking (posters, stickers, QR cards, ads). Contract: public.log_promo_visit,
// public.claim_signup_source and public.promo_stats in supabase/migrations/20261125100000_promo_src_tracking.sql.
// No supabase-js import: the landing page calls this before it has loaded a client.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabasePublic'

const SRC_KEY = 'he_src' // also written by public/boot.js from utm_source
const VISITOR_KEY = 'he_vid'
const SRC_RE = /^[a-z0-9_.-]{1,40}$/i

/** ?src= or ?utm_source= from this page's URL, cleaned; null when absent or malformed. */
export function srcFromUrl(search = location.search): string | null {
  const q = new URLSearchParams(search)
  const s = q.get('src') ?? q.get('utm_source')
  return s && SRC_RE.test(s) ? s.toLowerCase() : null
}

export function storedSrc(): string | null {
  try {
    const s = localStorage.getItem(SRC_KEY)
    return s && SRC_RE.test(s) ? s.toLowerCase() : null
  } catch { return null }
}

function visitorId(): string | null {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(VISITOR_KEY, id) }
    return id
  } catch { return null }
}

/** Count this visit once per tag per day. Fire-and-forget: tracking never blocks or breaks the page. */
export function logPromoVisit(): void {
  const src = srcFromUrl()
  if (!src) return
  try {
    localStorage.setItem(SRC_KEY, src)
    const today = new Date().toISOString().slice(0, 10)
    const seenKey = `he_pv_${src}`
    if (localStorage.getItem(seenKey) === today) return
    const visitor = visitorId()
    if (!visitor) return
    fetch(`${SUPABASE_URL}/rest/v1/rpc/log_promo_visit`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_src: src, p_visitor: visitor }),
    }).then(r => { if (r.ok) localStorage.setItem(seenKey, today) }).catch(() => {})
  } catch { /* storage blocked: skip */ }
}
