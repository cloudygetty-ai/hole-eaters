// First-touch ad attribution. The landing and /app both call captureAttribution() on load; every
// account creation (guest or email) sends attributionMeta() as Supabase user_metadata, so each
// auth.users row records which campaign/video brought that person in. No table or migration needed.
// Storage can be blocked (private mode, in-app browsers): attribution is best-effort and never throws.

const KEY = 'he_attrib'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
const clean = (v: string) => v.replace(/[^a-z0-9_.:-]/gi, '').slice(0, 64)

/** Saves utm_* from the current URL. First touch wins: an existing record is never overwritten. */
export function captureAttribution(search = location.search, referrer = document.referrer): void {
  try {
    if (localStorage.getItem(KEY)) return
    const q = new URLSearchParams(search)
    const utm: Record<string, string> = {}
    for (const k of UTM_KEYS) { const v = q.get(k); if (v && clean(v)) utm[k] = clean(v) }
    if (!Object.keys(utm).length) return
    let ref: string | null = null
    try { ref = referrer ? new URL(referrer).hostname : null } catch { /* malformed referrer */ }
    localStorage.setItem(KEY, JSON.stringify({ ...utm, landed_at: new Date().toISOString(), ...(ref ? { referrer_host: ref } : {}) }))
  } catch { /* storage blocked */ }
}

/** Flat string map for `options.data` on signUp / signInAnonymously. Empty when nothing was captured. */
export function attributionMeta(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch { return {} }
}

/** Instagram, Facebook, TikTok, Grindr etc. embed a browser that can't Add to Home Screen or get push. */
export function isInAppBrowser(ua = navigator.userAgent): boolean {
  return /FBAN|FBAV|Instagram|Snapchat|TikTok|musical_ly|Twitter|Line\/|GSA\/|Grindr|Reddit|LinkedInApp/i.test(ua)
}
