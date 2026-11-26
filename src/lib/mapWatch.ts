// "Ping me when someone shows up": one watch per person, stored rounded to ~1 km.
// It ends after one ping or 30 days. Contract: public.set_map_watch / clear_map_watch / my_map_watch
// in supabase/migrations/20261126140000_empty_map_pings_and_nights.sql.
import { supabase } from './supabase'

/** true/false = watch on/off; null = the database doesn't have watches yet, so the switch stays hidden. */
export async function getMapWatch(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('my_map_watch')
  if (error) { console.warn('[mapWatch] read', error.message); return null }
  return data === true
}

export async function setMapWatch(lat: number, lng: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_map_watch', { p_lat: lat, p_lng: lng })
  if (error) console.warn('[mapWatch] set', error.message)
  return !error && data === true
}

export async function clearMapWatch(): Promise<boolean> {
  const { error } = await supabase.rpc('clear_map_watch')
  if (error) console.warn('[mapWatch] clear', error.message)
  return !error
}
