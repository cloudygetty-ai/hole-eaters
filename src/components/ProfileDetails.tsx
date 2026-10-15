import type { CSSProperties } from 'react'
import {
  BODY_TYPES, ENDOWMENTS_IN, HEIGHTS_IN, HIV_STATUSES, INTEREST_GROUPS, PRACTICES,
  formatHeight, formatTested, statsLine, hasAnyDetails,
  type MultiKey, type ProfileDetails,
} from '../lib/profileDetails'

// App tokens are passed in so this module never imports upward from App.tsx
export interface DetailsTheme { accent: string; surf3: string; border: string; border2: string; text: string; muted: string; dim: string }

const label = (t: DetailsTheme): CSSProperties => ({ fontSize: 11, color: t.dim, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 })

function Chip({ on, children, onClick, t }: { on: boolean; children: string; onClick: () => void; t: DetailsTheme }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{ padding: '8px 13px', borderRadius: 20, background: on ? `${t.accent}22` : t.surf3, border: `1px solid ${on ? t.accent : t.border2}`, color: on ? t.accent : t.muted, fontWeight: on ? 700 : 400, fontSize: 13, transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}

const toggle = (list: string[] | undefined, v: string) => (list ?? []).includes(v) ? (list ?? []).filter(x => x !== v) : [...(list ?? []), v]

type Section = 'stats' | 'interests' | 'health'

export function ProfileDetailsFields({ value, onChange, sections, theme: t }: {
  value: ProfileDetails; onChange: (next: ProfileDetails) => void; sections: Section[]; theme: DetailsTheme
}) {
  const set = (patch: Partial<ProfileDetails>) => onChange({ ...value, ...patch })
  const select: CSSProperties = { background: t.surf3, border: `1px solid ${t.border2}`, borderRadius: 12, padding: '12px 12px', color: t.text, fontSize: 14, width: '100%', outline: 'none', appearance: 'none' }
  const multi = (key: MultiKey, options: string[]) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => <Chip key={o} t={t} on={!!value[key]?.includes(o)} onClick={() => set({ [key]: toggle(value[key], o) })}>{o}</Chip>)}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.includes('stats') && (<>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={label(t)}>Height</div>
            <select aria-label="Height" value={value.height_in ?? ''} onChange={e => set({ height_in: e.target.value ? Number(e.target.value) : undefined })} style={select}>
              <option value="">—</option>
              {HEIGHTS_IN.map(h => <option key={h} value={h}>{formatHeight(h)}</option>)}
            </select>
          </div>
          <div>
            <div style={label(t)}>Weight (lb)</div>
            <input aria-label="Weight in pounds" inputMode="numeric" value={value.weight_lb ?? ''} placeholder="—"
              onChange={e => set({ weight_lb: parseInt(e.target.value.replace(/\D/g, '').slice(0, 3)) || undefined })}
              style={select} />
          </div>
          <div>
            <div style={label(t)}>Size</div>
            <select aria-label="Size" value={value.endowment_in ?? ''} onChange={e => set({ endowment_in: e.target.value ? Number(e.target.value) : undefined })} style={select}>
              <option value="">—</option>
              {ENDOWMENTS_IN.map(s => <option key={s} value={s}>{s}"</option>)}
            </select>
          </div>
          <div>
            <div style={label(t)}>Cut / Uncut</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['Cut', 'Uncut'] as const).map(c => <Chip key={c} t={t} on={value.cut === c} onClick={() => set({ cut: value.cut === c ? undefined : c })}>{c}</Chip>)}
            </div>
          </div>
        </div>
        <div>
          <div style={label(t)}>Body</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BODY_TYPES.map(b => <Chip key={b} t={t} on={value.body === b} onClick={() => set({ body: value.body === b ? undefined : b })}>{b}</Chip>)}
          </div>
        </div>
      </>)}

      {sections.includes('interests') && INTEREST_GROUPS.map(g => (
        <div key={g.key}>
          <div style={label(t)}>{g.label}</div>
          {multi(g.key, g.options)}
        </div>
      ))}

      {sections.includes('health') && (<>
        <div>
          <div style={label(t)}>Practices</div>
          {multi('practices', PRACTICES)}
        </div>
        <div>
          <div style={label(t)}>HIV Status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {HIV_STATUSES.map(s => <Chip key={s} t={t} on={value.hiv_status === s} onClick={() => set({ hiv_status: value.hiv_status === s ? undefined : s })}>{s}</Chip>)}
          </div>
        </div>
        <div>
          <div style={label(t)}>Last tested</div>
          <input aria-label="Last tested month" type="month" value={value.hiv_tested ?? ''} max={new Date().toISOString().slice(0, 7)}
            onChange={e => set({ hiv_tested: e.target.value || undefined })} style={{ ...select, colorScheme: 'dark' }} />
        </div>
        <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>Optional. Only shown on your profile if you fill it in.</div>
      </>)}
    </div>
  )
}

// Read-only layout modelled on the label-left / values-right profile sheet
export function ProfileDetailsView({ details, theme: t }: { details: ProfileDetails | null | undefined; theme: DetailsTheme }) {
  if (!hasAnyDetails(details)) return null
  const d = details!
  const rows: { label: string; values: string[] }[] = [
    ...INTEREST_GROUPS.map(g => ({ label: g.label, values: d[g.key] ?? [] })),
    { label: 'Practices', values: d.practices ?? [] },
    { label: 'HIV Status', values: d.hiv_status ? [d.hiv_status] : [] },
    { label: 'HIV Tested', values: d.hiv_tested ? [formatTested(d.hiv_tested)] : [] },
  ].filter(r => r.values.length > 0)
  const stats = statsLine(d)

  return (
    <div style={{ marginTop: 14 }}>
      {stats && <div style={{ fontSize: 14, color: t.text, fontWeight: 600, marginBottom: 6 }}>{stats}</div>}
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 10, padding: '12px 0', borderTop: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 13, color: t.muted }}>{r.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 13, color: t.text }}>
            {r.values.map(v => <span key={v}>{v}</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}
