// src/styles/tokens.ts
// Single source of truth for the Velvet Room theme.
// CSS vars live in theme.css; this mirrors them for inline-style components.

export const C = {
  ink:      '#090608',
  velvet:   '#170D12',
  velvet2:  '#1F1218',
  hairline: 'rgba(177,138,85,0.22)',

  oxblood:  '#4E0D1E',
  ember:    '#B22B44',
  emberUp:  '#D94A63',
  brass:    '#B18A55',
  brassUp:  '#E0C08A',

  ivory:    '#EFE6DA',
  smoke:    '#97867F',
  whisper:  'rgba(239,230,218,0.42)',
} as const

export const F = {
  display: "'Bodoni Moda', Didot, serif",
  ui:      "'Instrument Sans', system-ui, sans-serif",
} as const

export const T = {
  mark:  { fontFamily: F.display, fontWeight: 900, fontSize: 44, lineHeight: 0.86, letterSpacing: '-0.03em' },
  title: { fontFamily: F.display, fontWeight: 400, fontSize: 26, letterSpacing: '-0.015em' },
  body:  { fontFamily: F.ui, fontSize: 15, lineHeight: 1.5 },
  label: { fontFamily: F.ui, fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: C.brass },
  data:  { fontFamily: F.ui, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: '0.06em', color: C.smoke },
} as const

export const R = { sm: 2, md: 4, lg: 10, pill: 999 } as const
export const SP = { xs: 6, sm: 10, md: 14, lg: 20, xl: 32 } as const

export const FX = {
  panel: {
    position: 'relative' as const,
    borderRadius: R.lg,
    background: `linear-gradient(180deg, rgba(255,255,255,0.045), transparent 34%),
                 linear-gradient(160deg, ${C.velvet2}, ${C.velvet} 62%, #120A0E)`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05),
                inset 0 0 0 1px rgba(0,0,0,0.55),
                0 18px 40px -22px rgba(0,0,0,0.95)`,
  },
  glass: {
    background: 'rgba(23,13,18,0.62)',
    backdropFilter: 'blur(22px) saturate(1.3)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.3)',
    border: `1px solid ${C.hairline}`,
  },
  emberGlow: `0 0 0 1px rgba(178,43,68,0.45), 0 0 26px -4px ${C.ember}`,
  ease: 'cubic-bezier(0.22,1,0.36,1)',
} as const

// Distance -> ring fill (0..1). 0 mi = full ring, >= maxMi = empty.
export const proximityFill = (mi: number, maxMi = 5) =>
  Math.max(0, Math.min(1, 1 - mi / maxMi))

export const rangeBand = (mi: number) =>
  mi <= 0.5 ? 'near' : mi <= 2 ? 'mid' : 'far'
