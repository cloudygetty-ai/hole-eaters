// Profile Insights, Picked for you, Second chances. All scoring happens in Postgres
// (supabase/migrations/20261117120000_profile_insights_picks_second_chances.sql); this file only calls it.
import { supabase } from './supabase'

export type Position = 'top' | 'vers' | 'bottom' | 'side'
export type Reason = 'Age' | 'Position' | 'Kinks'

export interface ProfileInsight {
  enough: boolean
  people?: '5+' | '10+' | '25+'
  bars?: Record<Position, number> // 0..1 shares of what they seem to be, from who they go for
  into?: string[]
  match?: number | null // 0..100, how well the viewer's own profile fits their behaviour
  reasons?: Reason[]
}

export interface Pick { id: string; score: number; reasons: Reason[] }
export interface SecondChance { id: string; last_chat_at: string; met: string | null }

/** Null when they opted out, are blocked, or are you; { enough: false } when there isn't enough activity yet. */
export async function getProfileInsight(target: string): Promise<ProfileInsight | null> {
  const { data, error } = await supabase.rpc('profile_insight', { target })
  if (error) return null
  return (data as ProfileInsight | null) ?? null
}

export async function getPicks(lat: number, lng: number, radius = 25000): Promise<Pick[]> {
  const { data, error } = await supabase.rpc('picked_for_you', { lat, lng, radius_meters: radius })
  return error || !Array.isArray(data) ? [] : (data as Pick[])
}

export async function getSecondChances(lat: number, lng: number, radius = 25000): Promise<SecondChance[]> {
  const { data, error } = await supabase.rpc('second_chances', { lat, lng, radius_meters: radius })
  return error || !Array.isArray(data) ? [] : (data as SecondChance[])
}

/** "3 days ago", "2 weeks ago", "4 months ago" */
export function since(iso: string, now = Date.now()): string {
  const days = Math.max(1, Math.round((now - new Date(iso).getTime()) / 86_400_000))
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}
