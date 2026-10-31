// Cruising spots: public LGBTQ venues from OpenStreetMap + member-submitted spots (reviewed by admins).
// Everything goes through database functions; see supabase/migrations/20261031*_cruising_spots*.sql.
import { supabase } from './supabase'

export const SPOT_KINDS = {
  park: { icon: '🌳', label: 'Park' },
  trail: { icon: '🥾', label: 'Trail' },
  beach: { icon: '🏖️', label: 'Beach' },
  gym: { icon: '🏋️', label: 'Gym' },
  sauna: { icon: '♨️', label: 'Sauna' },
  bathhouse: { icon: '🛁', label: 'Bathhouse' },
  adult_store: { icon: '📼', label: 'Adult store' },
  theater: { icon: '🎞️', label: 'Theater' },
  bar: { icon: '🍸', label: 'Bar' },
  club: { icon: '🪩', label: 'Club' },
  rest_stop: { icon: '🛣️', label: 'Rest stop' },
  other: { icon: '📍', label: 'Other' },
} as const
export type SpotKind = keyof typeof SPOT_KINDS

export interface Spot {
  id: string; kind: SpotKind; name: string; description: string; lat: number; lng: number
  source: 'community' | 'osm'; website: string | null
  status: 'approved' | 'pending' | 'near_school'
  here_now: number; active_votes: number; gone_votes: number
  my_vote: boolean | null; checked_in: boolean; mine: boolean
}
export interface Bounds { south: number; west: number; north: number; east: number }

export const REPORT_REASONS = [
  { id: 'not_there', label: "Doesn't exist / closed" },
  { id: 'near_kids', label: 'Near kids or a school' },
  { id: 'unsafe', label: 'Unsafe / police activity' },
  { id: 'spam', label: 'Spam or fake' },
  { id: 'other', label: 'Something else' },
] as const

const msg = (e: { message?: string } | null) => e ? (e.message ?? 'Something went wrong') : null

export async function getSpots(b: Bounds): Promise<Spot[]> {
  const { data } = await supabase.rpc('spots_in_view', { p_south: b.south, p_west: b.west, p_north: b.north, p_east: b.east })
  return (data as Spot[] | null) ?? []
}

/** Asks the server to fetch OpenStreetMap venues for this area (once a week per area, shared by everyone). */
export async function requestVenues(b: Bounds): Promise<number> {
  const { data } = await supabase.rpc('request_venues', { p_south: b.south, p_west: b.west, p_north: b.north, p_east: b.east })
  return (data as number | null) ?? 0
}

export async function addSpot(s: { kind: SpotKind; name: string; description: string; lat: number; lng: number }) {
  const { data, error } = await supabase.rpc('add_spot', { p_kind: s.kind, p_name: s.name, p_description: s.description, p_lat: s.lat, p_lng: s.lng })
  if (error && /check constraint/.test(error.message)) return { id: null, error: 'No phone numbers, links or odd characters in spots.' }
  return { id: data as string | null, error: msg(error) }
}

export async function checkInSpot(id: string) {
  const { data, error } = await supabase.rpc('check_in_spot', { p_spot: id })
  return { hereNow: (data as number | null) ?? 0, error: msg(error) }
}
export const checkOutSpot = (id: string) => supabase.rpc('check_out_spot', { p_spot: id })
export async function voteSpot(id: string, active: boolean) { return msg((await supabase.rpc('vote_spot', { p_spot: id, p_active: active })).error) }
export async function reportSpot(id: string, reason: string) { return msg((await supabase.rpc('report_spot', { p_spot: id, p_reason: reason })).error) }

export interface SpotForReview {
  id: string; kind: SpotKind; name: string; description: string; lat: number; lng: number; source: 'community' | 'osm'
  status: 'pending' | 'approved'; school_check: 'clear' | 'unavailable' | null; created_at: string
  creator_name: string | null; reports: number; reasons: string[]
}
export async function getSpotsForReview(): Promise<SpotForReview[]> {
  const { data } = await supabase.rpc('spots_for_review')
  return (data as SpotForReview[] | null) ?? []
}
export const moderateSpot = (id: string, status: 'approved' | 'hidden') => supabase.rpc('moderate_spot', { p_spot: id, p_status: status })

// Areas already asked for this session, so panning around doesn't re-ask
const asked = new Set<string>()
export function shouldRequestVenues(b: Bounds) {
  const key = [b.south, b.west].map(v => Math.floor(v / 0.25)).join(':')
  if (asked.has(key)) return false
  asked.add(key); return true
}
