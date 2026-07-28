// src/components/ui/Primitives.tsx
// Velvet Room primitives. Presentational only — no data, no side effects.

import { type ReactNode, type CSSProperties } from 'react'
import { proximityFill, rangeBand } from '../../styles/tokens'

/* ---------- Panel ---------- */
export function Panel({
  children, flush, style, className = '',
}: { children: ReactNode; flush?: boolean; style?: CSSProperties; className?: string }) {
  return (
    <div className={`he-panel ${flush ? 'he-panel--flush' : ''} ${className}`} style={style}>
      {children}
    </div>
  )
}

/* ---------- Signature: proximity ring ---------- */
export function ProximityRing({
  src, alt = '', miles, size = 56, maxMiles = 5,
}: { src?: string; alt?: string; miles: number; size?: number; maxMiles?: number }) {
  const band = rangeBand(miles)
  return (
    <div
      className="he-ring"
      data-range={band}
      style={{ ['--p' as string]: proximityFill(miles, maxMiles), ['--size' as string]: `${size}px` }}
      aria-label={`${miles.toFixed(1)} miles away`}
    >
      {src ? <img src={src} alt={alt} loading="lazy" /> : <div />}
    </div>
  )
}

/* ---------- Button ---------- */
type BtnVariant = 'ember' | 'brass' | 'ghost'
export function Button({
  children, variant = 'ember', full, ...rest
}: { children: ReactNode; variant?: BtnVariant; full?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const mod = variant === 'brass' ? 'he-btn--brass' : variant === 'ghost' ? 'he-btn--ghost' : ''
  return (
    <button {...rest} className={`he-btn ${mod}`} style={{ width: full ? '100%' : undefined, ...rest.style }}>
      {children}
    </button>
  )
}

/* ---------- Chip ---------- */
export function Chip({ children, live }: { children: ReactNode; live?: boolean }) {
  return <span className={`he-chip ${live ? 'he-chip--live' : ''}`}>{children}</span>
}

/* ---------- Label / Data ---------- */
export const Label = ({ children }: { children: ReactNode }) => <span className="he-label">{children}</span>
export const Data  = ({ children }: { children: ReactNode }) => <span className="he-data">{children}</span>

/* ---------- Sheet ---------- */
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null
  return (
    <>
      <div className="he-scrim" onClick={onClose} role="presentation" />
      <section className="he-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="he-sheet__grip" />
        {title && <h2 className="he-title" style={{ marginBottom: 16 }}>{title}</h2>}
        {children}
      </section>
    </>
  )
}

/* ---------- Nav rail ---------- */
export function Rail({
  items, active, onSelect,
}: {
  items: { key: string; label: string; icon: ReactNode }[]
  active: string
  onSelect: (key: string) => void
}) {
  return (
    <nav className="he-rail" aria-label="Primary">
      {items.map(it => (
        <button
          key={it.key}
          className="he-rail__item"
          aria-current={active === it.key ? 'page' : undefined}
          onClick={() => onSelect(it.key)}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </nav>
  )
}
