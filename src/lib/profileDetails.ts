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
  prevention?: string[] // Doxy-PEP + vaccinations
  hiv_status?: string
  hiv_tested?: string // YYYY-MM
  // Eating survey (onboarding welcome step)
  eat_role?: string
  eat_appetite?: string
  eat_style?: string[]
  eat_positions?: string[]
  eat_prep?: string[]
  cover_url?: string // Twitter-style banner image; lives here to avoid a schema change
}

export type MultiKey = 'location' | 'public' | 'looking_for' | 'fetishes' | 'kinks' | 'into' | 'practices' | 'prevention' | 'eat_style' | 'eat_positions' | 'eat_prep'
export type SingleKey = 'eat_role' | 'eat_appetite'

export const BODY_TYPES = ['Slim', 'Average', 'Athletic', 'Muscular', 'Stocky', 'Large']

export const INTEREST_GROUPS: { key: MultiKey; label: string; options: string[] }[] = [
  { key: 'location', label: 'Location', options: ['Can host', 'Can travel', 'Car', 'Hotel', 'Public'] },
  { key: 'public', label: 'Into Public', options: ['Arcades', 'Bathhouses', 'Saunas', 'Cruising spots', 'Glory holes', 'Gyms', 'Parks', 'Parties/Events', 'Restrooms'] },
  { key: 'looking_for', label: 'Looking For', options: ['Bros', 'Daddies', 'Guys Next Door', 'Jocks', 'Bears', 'Otters', 'Twinks', 'Muscle', 'Chubs', 'Older', 'Younger', 'Trans'] },
  // "Gear" was split into specific gear types; legacy values still render (see legacyValues)
  { key: 'fetishes', label: 'Fetishes', options: ['Body Hair', 'Beards', 'Hard Cocks', 'Cum', 'Feet', 'Pits', 'Musk', 'Jockstraps', 'Underwear', 'Leather', 'Rubber', 'Harnesses', 'Sportswear', 'Sneakers', 'Socks', 'Uniforms', 'Piercings', 'Tattoos'] },
  { key: 'kinks', label: 'Kinks', options: ['Cum Play', 'Breeding', 'Edging', 'Bondage', 'Blindfolds', 'Spanking', 'Toys', 'Fisting', 'Pup Play', 'Dom', 'Sub', 'Verbal', 'Group', 'Role Play', 'Watching', 'Exhibitionism'] },
  { key: 'into', label: 'Into', options: ['Fucking', 'Jerk Off', 'Oral', 'Oral (Swallow)', 'Rimming', '69', 'Frotting', 'Kissing', 'Making Out', 'Cuddling', 'Massage'] },
]

// Display-only renames. Stored values never change, so existing profiles keep their selections.
const OPTION_LABELS: Record<string, string> = {
  'Rimming': 'Eating Ass',
  'Bareback if PrEP': 'Bareback with PrEP users',
  'Positive, Undetectable': 'Undetectable (U=U)',
}
export const optionLabel = (v: string) => OPTION_LABELS[v] ?? v

// Stored values no longer offered as chips (e.g. "Gear") stay visible so they can be unselected
export const legacyValues = (options: string[], selected: string[] | undefined) =>
  (selected ?? []).filter(v => !options.includes(v))

// The welcome survey. Single-choice questions first, then multi-select. All optional.
export const EATING_SINGLE: { key: SingleKey; label: string; question: string; options: string[] }[] = [
  { key: 'eat_role', label: 'Eating', question: 'Eat or get eaten?', options: ['Eater', 'Get eaten', 'Both', 'Not my thing'] },
  { key: 'eat_appetite', label: 'Appetite', question: 'How hungry are you?', options: ['Could go for hours', 'Main course', 'Appetizer', 'Occasional treat'] },
]
export const EATING_MULTI: { key: MultiKey; label: string; question: string; options: string[] }[] = [
  { key: 'eat_style', label: 'Style', question: 'How do you like it?', options: ['Slow & sensual', 'Sloppy', 'Aggressive', 'Tongue deep', 'Spread wide open', 'Gaped', 'Fingers too', 'Toys too', 'Before fucking', 'All on its own'] },
  { key: 'eat_positions', label: 'Positions', question: 'Favorite positions?', options: ['Face down, ass up', 'Face-sitting', 'On my back, legs up', 'Bent over', 'Standing', '69'] },
  { key: 'eat_prep', label: 'Prep', question: 'Prep you expect (or offer)?', options: ['Fresh from the shower', 'Douched', 'Trimmed', 'Smooth', 'Natural / hairy', 'Ask me'] },
]
export const EATING_KEYS = [...EATING_SINGLE.map(q => q.key), ...EATING_MULTI.map(q => q.key)]

export const PRACTICES = ['Safer sex only', 'Bareback if PrEP', 'Bareback', 'Ask me']
export const PREVENTION = ['Doxy-PEP', 'Mpox vaccine', 'HPV vaccine', 'Hep A vaccine', 'Hep B vaccine', 'Meningitis vaccine']
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

// Last 24 months as YYYY-MM, newest first: a picker instead of iOS Safari's blank month input
export function testedMonths(now = new Date()): string[] {
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export function formatTested(ym: string | undefined): string {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ''
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function hasAnyDetails(d: ProfileDetails | null | undefined): boolean {
  return !!d && Object.entries(d).filter(([k]) => k !== 'cover_url').map(([, v]) => v).some(v => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''))
}
