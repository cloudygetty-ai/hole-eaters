// Profile photos, videos and covers live in the private `media` bucket. The database still stores the
// object's canonical URL (…/object/public/media/<path>) as an identifier; this module turns it into a
// short-lived signed URL at render time. Requests from many avatars are batched into one call and cached
// until shortly before they expire, so a link copied out of the app stops working within MEDIA_TTL_S.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const MEDIA_TTL_S = 30 * 60
const REFRESH_EARLY_MS = 5 * 60_000
const MEDIA_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/media\/([^?#]+)/

/** Storage path inside the media bucket, or null for anything else (stickers, blob: previews, other hosts). */
export function mediaPath(url: string | null | undefined): string | null {
  if (!url) return null
  const m = MEDIA_RE.exec(url)
  return m ? decodeURIComponent(m[1]) : null
}

const cache = new Map<string, { url: string; exp: number }>()
const waiting = new Map<string, ((u: string | null) => void)[]>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const paths = [...waiting.keys()]
  const cbs = new Map(waiting); waiting.clear()
  const { data, error } = await supabase.storage.from('media').createSignedUrls(paths, MEDIA_TTL_S)
  if (error) console.warn('[media] sign failed', error.message)
  const exp = Date.now() + MEDIA_TTL_S * 1000 - REFRESH_EARLY_MS
  const byPath = new Map((data ?? []).map(d => [d.path ?? '', d.signedUrl ?? null]))
  for (const p of paths) {
    const signed = byPath.get(p) ?? null
    if (signed) cache.set(p, { url: signed, exp })
    cbs.get(p)?.forEach(cb => cb(signed))
  }
}

function sign(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url)
  return new Promise(resolve => {
    const list = waiting.get(path) ?? []
    list.push(resolve); waiting.set(path, list)
    if (!timer) timer = setTimeout(flush, 25) // gather a screenful of avatars into one request
  })
}

/** Render-ready URL for a stored media URL; undefined while signing. Re-signs before expiry. */
export function useMediaUrl(url: string | null | undefined): string | undefined {
  const path = mediaPath(url)
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(() => {
    const hit = path ? cache.get(path) : undefined
    return hit && hit.exp > Date.now() ? { path: path!, url: hit.url } : null
  })
  useEffect(() => {
    if (!path) return
    let live = true
    let refresh: ReturnType<typeof setTimeout> | undefined
    const run = () => sign(path).then(u => {
      if (!live || !u) return
      setSigned({ path, url: u })
      refresh = setTimeout(run, Math.max(60_000, (cache.get(path)?.exp ?? Date.now()) - Date.now()))
    })
    run()
    return () => { live = false; clearTimeout(refresh) }
  }, [path])
  if (!url) return undefined
  if (!path) return url
  return signed?.path === path ? signed.url : undefined
}
