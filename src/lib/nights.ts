// Nights at spots: dated events (planned with venues, added by admins) that open their own Pulse Room
// when they start. "I'm going" doubles as the reminder push. Contract: public.upcoming_nights /
// rsvp_night / add_night / remove_night in supabase/migrations/20261126140000_empty_map_pings_and_nights.sql.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { SpotKind } from './spots'

export interface Night {
  id: string; title: string; starts_at: string; ends_at: string
  spot_id: string; spot_name: string; spot_kind: SpotKind; lat: number; lng: number
  going: number; i_am_going: boolean; live: boolean; room_id: string | null
}

const REFRESH_MS = 5 * 60_000
const MOVE_DEG = 0.02 // ~2 km before the list is worth refetching

const msg = (e: { message?: string } | null) => e ? (e.message ?? 'Something went wrong') : null

/** null = couldn't load (offline, or the database doesn't have nights yet). */
export async function getNights(lat: number, lng: number): Promise<Night[] | null> {
  const { data, error } = await supabase.rpc('upcoming_nights', { p_lat: lat, p_lng: lng })
  if (error) { console.warn('[nights] load', error.message); return null }
  return (data as Night[] | null) ?? []
}

export async function rsvpNight(id: string, going: boolean): Promise<{ going: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('rsvp_night', { p_night: id, p_going: going })
  return { going: (data as number | null) ?? null, error: msg(error) }
}

export async function addNight(spotId: string, title: string, startsAt: Date, endsAt: Date): Promise<string | null> {
  const { error } = await supabase.rpc('add_night', { p_spot: spotId, p_title: title.trim(), p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString() })
  if (error && /check constraint/.test(error.message)) return 'Keep the name to 2–40 characters, with no links or odd characters.'
  return msg(error)
}

export async function removeNight(id: string): Promise<string | null> {
  return msg((await supabase.rpc('remove_night', { p_night: id })).error)
}

/** "Live now", "Tonight · 9 PM", "Tomorrow · 10:30 PM", "Fri · 9 PM", "Dec 12 · 9 PM". */
export function nightWhen(n: Pick<Night, 'starts_at' | 'ends_at'>, now = new Date()): string {
  const start = new Date(n.starts_at)
  if (start <= now && new Date(n.ends_at) > now) return 'Live now'
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: start.getMinutes() ? '2-digit' : undefined })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(start) - day(now)) / 86_400_000)
  const label = days === 0 ? (start.getHours() >= 17 ? 'Tonight' : 'Today')
    : days === 1 ? 'Tomorrow'
    : days < 7 ? start.toLocaleDateString(undefined, { weekday: 'short' })
    : start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${label} · ${time}`
}

/** Nights near `coords`, refreshed every 5 minutes and after a ~2 km move. */
export function useNights(coords: { lat: number; lng: number } | null, enabled = true) {
  const [nights, setNights] = useState<Night[]>([])
  const last = useRef<{ lat: number; lng: number } | null>(null)
  const coordsRef = useRef(coords)
  coordsRef.current = coords

  const refresh = useCallback(async () => {
    const c = coordsRef.current
    if (!c) return
    last.current = c
    const next = await getNights(c.lat, c.lng)
    if (next) setNights(next) // keep the last good list on a failed fetch
  }, [])

  useEffect(() => {
    if (!enabled || !coords) return
    const prev = last.current
    if (!prev || Math.abs(prev.lat - coords.lat) > MOVE_DEG || Math.abs(prev.lng - coords.lng) > MOVE_DEG) void refresh()
  }, [enabled, coords, refresh])

  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, REFRESH_MS)
    return () => clearInterval(t)
  }, [enabled, refresh])

  /** Local update after an RSVP so the count moves without waiting for a refetch. */
  const patch = useCallback((id: string, change: Partial<Night>) => {
    setNights(list => list.map(n => n.id === id ? { ...n, ...change } : n))
  }, [])

  return { nights, refresh, patch }
}
