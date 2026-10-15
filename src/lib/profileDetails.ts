// Structured, optional profile details stored in profiles.details (jsonb).
// One source of truth for option lists, so onboarding, the editor and the profile view stay in sync.

export interface ProfileDetails {
  height_in?: number
  weight_lb?: number
  endowment_in?: number
  cut?: 'Cut' | 'Uncut'
  body?: string
  location?: string[]
  public?: string[]
  looking_for?: string[]
  fetishes?: string[]
  kinks?: string[]
  into?: string[]
  practices?: string[]
  hiv_status?: string
  hiv_tested?: string // YYYY-MM
}

export type MultiKey = 'location' | 'public' | 'looking_for' | 'fetishes' | 'kinks' | 'into' | 'practices'

export const BODY_TYPES = ['Slim', 'Average', 'Athletic', 'Muscular', 'Stocky', 'Large']

export const INTEREST_GROUPS: { key: MultiKey; label: string; options: string[] }[] = [
  { key: 'location', label: 'Location', options: ['Can host', 'Can travel', 'Car', 'Public'] },
  { key: 'public', label: 'Into Public', options: ['Arcades', 'Bathhouses', 'Cruising spots', 'Gyms', 'Parks', 'Parties/Events', 'Restrooms'] },
  { key: 'looking_for', label: 'Looking For', options: ['Bros', 'Daddies', 'Guys Next Door', 'Jocks', 'Bears', 'Otters', 'Twinks', 'Muscle', 'Chubs', 'Trans'] },
  { key: 'fetishes', label: 'Fetishes', options: ['Body Hair', 'Hard Cocks', 'Cum', 'Feet', 'Gear', 'Jockstraps', 'Leather', 'Piercings', 'Tattoos', 'Underwear'] },
  { key: 'kinks', label: 'Kinks', options: ['Cum Play', 'Edging', 'Bondage', 'Dom', 'Sub', 'Group', 'Role Play', 'Watching'] },
  { key: 'into', label: 'Into', options: ['Fucking', 'Jerk Off', 'Oral', 'Oral (Swallow)', 'Rimming', 'Kissing', 'Making Out'] },
]

export const PRACTICES = ['Safer sex only', 'Bareback if PrEP', 'Bareback', 'Ask me']
export const HIV_STATUSES = ['Negative', 'Negative, On PrEP', 'Positive, Undetectable', 'Positive', 'Prefer not to say']

export const HEIGHTS_IN = Array.from({ length: 31 }, (_, i) => 58 + i) // 4'10" – 7'0"
export const ENDOWMENTS_IN = Array.from({ length: 13 }, (_, i) => 4 + i * 0.5) // 4" – 10"

export const formatHeight = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`

// "5'9", 195lb, 6.5" cut, average" — mirrors the compact stats line people expect on cruising apps
export function statsLine(d: ProfileDetails | null | undefined): string {
  if (!d) return ''
  const parts: string[] = []
  if (d.height_in) parts.push(formatHeight(d.height_in))
  if (d.weight_lb) parts.push(`${d.weight_lb}lb`)
  if (d.endowment_in) parts.push(`${d.endowment_in}"${d.cut ? ` ${d.cut.toLowerCase()}` : ''}`)
  else if (d.cut) parts.push(d.cut.toLowerCase())
  if (d.body) parts.push(d.body.toLowerCase())
  return parts.join(', ')
}

export function formatTested(ym: string | undefined): string {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ''
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function hasAnyDetails(d: ProfileDetails | null | undefined): boolean {
  return !!d && Object.values(d).some(v => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''))
}
