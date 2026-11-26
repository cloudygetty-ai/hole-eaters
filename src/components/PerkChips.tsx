// Invite rewards as they show on someone's profile row and profile drawer.
// Colors are fixed (not themed) so the reward reads the same everywhere it appears.
export const SPOTLIGHT_GOLD = '#f5c84c'

const chip = (color: string) => ({
  fontSize: 10, fontWeight: 700, color, background: `${color}1f`, border: `1px solid ${color}55`,
  padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap' as const, letterSpacing: 0.2,
})

export function PerkChips({ spotlight, founder }: { spotlight?: boolean; founder?: boolean }) {
  if (!spotlight && !founder) return null
  return (
    <>
      {spotlight && <span style={chip(SPOTLIGHT_GOLD)} title="Brought someone to Hole Eaters in the last day">🔦 Spotlight</span>}
      {founder && <span style={chip('#e7b6ff')} title="Brought 3 or more people to Hole Eaters">👑 Founding Eater</span>}
    </>
  )
}
