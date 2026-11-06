import { useState } from 'react'
import { TOD_LEVELS, todLabel, todLevelMeta, todText, type TodKind, type TodLevel, type TodPrompt } from '../lib/truthOrDare'

// Theme is passed in so this module never imports upward from App.tsx.
export interface TodTheme { accent: string; surf2: string; surf3: string; border2: string; text: string; muted: string; dim: string }

/** Bottom sheet: pick a level, then Truth / Dare / Surprise me. */
export function TodPicker({ onSend, onClose, theme: t }: { onSend: (kind: TodKind, level: TodLevel) => void; onClose: () => void; theme: TodTheme }) {
  const [level, setLevel] = useState<TodLevel>('mild')
  const btn = (primary: boolean) => ({ flex: 1, padding: '14px 0', borderRadius: 14, fontWeight: 800, fontSize: 15, background: primary ? t.accent : t.surf3, color: primary ? '#fff' : t.text, border: `1px solid ${primary ? t.accent : t.border2}` })
  return (
    <div role="dialog" aria-label="Truth or Dare" style={{ padding: '16px 14px 18px', background: t.surf2, borderTop: `1px solid ${t.border2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>🎲 Truth or Dare</div>
        <button aria-label="Close" onClick={onClose} style={{ color: t.dim, fontSize: 16 }}>✕</button>
      </div>
      <div role="radiogroup" aria-label="Heat level" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {TOD_LEVELS.map(l => (
          <button key={l.level} role="radio" aria-checked={level === l.level} onClick={() => setLevel(l.level)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 13, fontWeight: level === l.level ? 700 : 400, background: level === l.level ? `${t.accent}22` : t.surf3, border: `1px solid ${level === l.level ? t.accent : t.border2}`, color: level === l.level ? t.accent : t.muted }}>
            {l.emoji} {l.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSend('truth', level)} style={btn(false)}>Truth</button>
        <button onClick={() => onSend('dare', level)} style={btn(false)}>Dare</button>
        <button onClick={() => onSend(Math.random() < 0.5 ? 'truth' : 'dare', level)} style={btn(true)}>Surprise</button>
      </div>
      <div style={{ fontSize: 11, color: t.dim, marginTop: 10, textAlign: 'center' }}>Anyone can skip any card. No means no — even in a game.</div>
    </div>
  )
}

/** In-chat card for a received or sent prompt. */
export function TodCard({ prompt, fallback, mine, onReply, theme: t }: { prompt: TodPrompt; fallback: string; mine: boolean; onReply?: () => void; theme: TodTheme }) {
  const lvl = todLevelMeta(prompt.level)
  const text = todText(prompt) ?? fallback.replace(/^🎲 \S+ \S+: /, '')
  return (
    <div style={{ maxWidth: '78%', borderRadius: 18, padding: '12px 14px', background: `linear-gradient(135deg, ${t.accent}33, ${t.surf2})`, border: `1px solid ${t.accent}66` }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: t.accent, marginBottom: 6 }}>
        🎲 {todLabel(prompt)} · {lvl.emoji} {lvl.label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: t.text }}>{text}</div>
      <div style={{ fontSize: 11, color: t.muted, marginTop: 8 }}>
        {mine ? 'Waiting on his answer…' : <>Your move — answer below, or <button onClick={onReply} style={{ color: t.accent, fontWeight: 700, fontSize: 11, padding: 0, textDecoration: 'underline' }}>send one back</button>.</>}
      </div>
    </div>
  )
}
