import { useId, useMemo, type CSSProperties } from 'react'
import { ANTHEM_MAX_LEN, isAnthem, parseAnthem } from '../lib/anthem'
import type { DetailsTheme } from './ProfileDetails'

// Theme is passed in so this module never imports upward from App.tsx (same contract as ProfileDetails).

const label = (t: DetailsTheme): CSSProperties => ({ fontSize: 11, color: t.dim, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 })

/** Controlled input for ProfileEditor. Parent persists via anthemForSave(). */
export function AnthemField({ value, onChange, theme: t }: { value: string; onChange: (next: string) => void; theme: DetailsTheme }) {
  const id = useId()
  const parsed = useMemo(() => (value.trim() ? parseAnthem(value) : null), [value])
  const error = parsed && !isAnthem(parsed) ? parsed.error : null
  const hint = isAnthem(parsed) ? `✓ ${parsed.label} ${parsed.kind}` : 'Spotify, Apple Music, SoundCloud, YouTube, Bandcamp or Tidal'

  return (
    <div>
      <label htmlFor={id} style={{ ...label(t), display: 'block' }}>Anthem</label>
      <input
        id={id} type="url" inputMode="url" autoComplete="off" spellCheck={false}
        maxLength={ANTHEM_MAX_LEN + 100} placeholder="Paste a song link"
        value={value} onChange={e => onChange(e.target.value)}
        aria-invalid={!!error} aria-describedby={`${id}-msg`}
        style={{ background: t.surf3, border: `1px solid ${error ? t.accent : t.border2}`, borderRadius: 12, padding: '12px 14px', color: t.text, fontSize: 14, width: '100%', outline: 'none' }}
      />
      <div id={`${id}-msg`} role="status" style={{ fontSize: 12, marginTop: 6, color: error ? t.accent : t.dim }}>{error ?? hint}</div>
    </div>
  )
}

/** Outbound link card on profiles. Renders nothing for missing/invalid values. */
export function AnthemCard({ url, theme: t }: { url: string | null | undefined; theme: DetailsTheme }) {
  const a = useMemo(() => (url ? parseAnthem(url) : null), [url])
  if (!isAnthem(a)) return null
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Anthem — listen on ${a.label}`}
      style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, padding: '12px 14px', borderRadius: 14, textDecoration: 'none', color: t.text, background: `linear-gradient(135deg, ${t.accent}26, ${t.surf3})`, border: `1px solid ${t.accent}55` }}>
      <span aria-hidden="true" className="anthem-eq" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 18 }}>
        <i /><i /><i />
      </span>
      <span style={{ display: 'grid', flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Anthem</span>
        <span style={{ fontSize: 12, color: t.muted }}>Listen on {a.label}</span>
      </span>
      <span aria-hidden="true" style={{ color: t.accent, fontSize: 16 }}>↗</span>
      <style>{`.anthem-eq i{width:3px;border-radius:2px;background:${t.accent};animation:anthemEq 1s ease-in-out infinite}.anthem-eq i:nth-child(2){animation-delay:.2s}.anthem-eq i:nth-child(3){animation-delay:.4s}@keyframes anthemEq{0%,100%{height:30%}50%{height:100%}}@media (prefers-reduced-motion:reduce){.anthem-eq i{animation:none;height:60%}}`}</style>
    </a>
  )
}
