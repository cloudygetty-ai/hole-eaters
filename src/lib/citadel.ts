// ─── Citadel (push fan-out + live presence) ─────────────────────────────────
// Runs alongside Supabase: Supabase stays the source of truth for auth and data.
// Citadel trusts the Supabase access token directly, so a Citadel user id === auth.uid().
// Disabled (null) when VITE_CITADEL_URL / VITE_CITADEL_KEY are unset — every caller degrades
// to the existing Supabase-only behavior, so the app survives Citadel being absent or down.
import { useSyncExternalStore } from 'react'
import { createClient, type Channel, type CitadelClient } from '../vendor/citadel'
import { supabase } from './supabase'

const URL_ = import.meta.env.VITE_CITADEL_URL as string | undefined
const KEY = import.meta.env.VITE_CITADEL_KEY as string | undefined

export const citadel: CitadelClient | null = URL_ && KEY
  ? createClient({
      url: URL_,
      key: KEY,
      accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    })
  : null

// ─── Push: register this browser's subscription for Citadel fan-out ─────────
export async function registerWebPush(sub: PushSubscription): Promise<void> {
  if (!citadel) return
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return
  // Token = the subscription JSON; Citadel routes JSON tokens to Web Push and opaque ones to FCM.
  await citadel.push.register('web', JSON.stringify({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }))
    .catch((e) => console.warn('[citadel] push register failed', e))
}

export async function unregisterWebPush(sub: PushSubscription): Promise<void> {
  if (!citadel) return
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return
  await citadel.push.unregister(JSON.stringify({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }))
    .catch(() => {}) // already gone is fine
}

// ─── Presence: who is actually connected right now ──────────────────────────
// Replaces the sticky `profiles.online` flag (set on open, rarely cleared) with heartbeat-backed
// membership: a closed tab or dead phone drops out within ~60s, even without a clean disconnect.
const ONLINE_CHANNEL = 'room:online'
const conns = new Map<string, string | null>() // connId → userId (one user may have several tabs)
let snapshot: ReadonlySet<string> | null = null
const listeners = new Set<() => void>()

function publish() {
  snapshot = new Set([...conns.values()].filter((v): v is string => !!v))
  listeners.forEach((l) => l())
}

/**
 * Joins the online room. `visible` = false (ghost mode) still observes others but is not counted.
 * Returns a stop function; call again with a new `visible` to switch modes.
 */
export function startPresence(visible: boolean): () => void {
  if (!citadel) return () => {}
  let channel: Channel | null = citadel.channel(ONLINE_CHANNEL)
  const ch = channel
  const off = ch.onPresence(({ event, member }) => {
    if (event === 'leave') conns.delete(member.connId)
    else conns.set(member.connId, member.userId)
    publish()
  })
  ;(async () => {
    try {
      if (visible) await ch.track({})
      for (const m of await ch.members()) conns.set(m.connId, m.userId)
      publish()
    } catch (e) {
      console.warn('[citadel] presence unavailable', e)
    }
  })()
  return () => {
    off()
    conns.clear()
    snapshot = null
    listeners.forEach((l) => l())
    void channel?.leave()
    channel = null
  }
}

/** Live set of online user ids, or null when Citadel is off (callers fall back to `profiles.online`). */
export function useOnlineIds(): ReadonlySet<string> | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => snapshot,
  )
}
