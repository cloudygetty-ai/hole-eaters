// Profile "Anthem": a user-pasted music link rendered as a plain outbound link card.
// Deliberately no provider API, SDK or embed — keeps us outside Spotify/Apple developer & widget terms.
// Host allowlist must mirror the DB constraint profiles_anthem_safe (DB is the source of truth).

export type AnthemProvider = 'spotify' | 'apple' | 'soundcloud' | 'youtube' | 'bandcamp' | 'tidal'
export interface Anthem { url: string; provider: AnthemProvider; label: string; kind: string }
export type AnthemResult = Anthem | { error: string }

export const ANTHEM_MAX_LEN = 300

const RULES: Array<{ provider: AnthemProvider; label: string; host: RegExp }> = [
  { provider: 'spotify', label: 'Spotify', host: /^open\.spotify\.com$/ },
  { provider: 'apple', label: 'Apple Music', host: /^music\.apple\.com$/ },
  { provider: 'soundcloud', label: 'SoundCloud', host: /^(on\.)?soundcloud\.com$/ },
  { provider: 'youtube', label: 'YouTube', host: /^((www|m|music)\.)?youtube\.com$|^youtu\.be$/ },
  { provider: 'bandcamp', label: 'Bandcamp', host: /^[a-z0-9-]+\.bandcamp\.com$/ },
  { provider: 'tidal', label: 'Tidal', host: /^(listen\.)?tidal\.com$/ },
]
const SAFE_TAIL = /^[A-Za-z0-9/_.~%?=&+-]*$/
// Query params that identify content; everything else (si=, utm_*, t=) is tracking and dropped.
const KEEP_PARAMS = ['v', 'list', 'i']

function kindOf(provider: AnthemProvider, tail: string): string {
  const seg = tail.split('?')[0].split('/').filter(Boolean)
  switch (provider) {
    case 'spotify':
    case 'tidal': return seg.find(s => ['track', 'album', 'playlist', 'artist'].includes(s)) ?? 'link'
    case 'apple': return tail.includes('i=') ? 'track' : seg[1] ?? 'link'
    case 'bandcamp': return seg[0] ?? 'link'
    case 'youtube': return tail.includes('list=') ? 'playlist' : 'video'
    case 'soundcloud': return 'track'
  }
}

export const isAnthem = (r: AnthemResult | null): r is Anthem => !!r && !('error' in r)

/** Validate + normalize a pasted link. Pure. */
export function parseAnthem(raw: string): AnthemResult {
  const input = raw.trim()
  if (!input) return { error: 'Paste a link' }
  if (input.length > ANTHEM_MAX_LEN) return { error: 'Link is too long' }
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`) } catch { return { error: "That doesn't look like a link" } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Unsupported link' }
  const host = u.hostname.toLowerCase()
  const rule = RULES.find(r => r.host.test(host))
  if (!rule) return { error: 'Use Spotify, Apple Music, SoundCloud, YouTube, Bandcamp or Tidal' }
  const keep = new URLSearchParams()
  for (const k of KEEP_PARAMS) { const v = u.searchParams.get(k); if (v) keep.set(k, v) }
  const qs = keep.toString()
  const tail = `${u.pathname}${qs ? `?${qs}` : ''}`
  if (!SAFE_TAIL.test(tail)) return { error: 'Link has unsupported characters' }
  const url = `https://${host}${tail}`
  if (url.length > ANTHEM_MAX_LEN) return { error: 'Link is too long' }
  return { url, provider: rule.provider, label: rule.label, kind: kindOf(rule.provider, tail) }
}

/** Value to persist: normalized URL, null for empty, undefined if invalid (caller blocks save). */
export function anthemForSave(raw: string): string | null | undefined {
  if (!raw.trim()) return null
  const r = parseAnthem(raw)
  return isAnthem(r) ? r.url : undefined
}
