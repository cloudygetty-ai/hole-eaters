import { useEffect, useState } from 'react'
import { getInsights, type Insights as Data } from '../lib/supabase'

// "Who's into you": the kinds of people who viewed, liked and messaged you. Aggregates only;
// people who opted out of insights are left out of the breakdowns. Nobody is named here.

export interface InsightsTheme { bg: string; surface: string; surf2: string; surf3: string; border: string; text: string; muted: string; dim: string; accent: string; green: string }

const PALETTE = ['#4d79ff', '#ff4d6d', '#f59e0b', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b']
const AGE_ORDER = ['18-25', '26-35', '36-45', '46-55', '56+']

function Gauge({ score, t }: { score: number | null; t: InsightsTheme }) {
  // Half-circle from 1 (selective) to 10 (replies to everyone)
  const v = score ?? 0, frac = score ? (v - 1) / 9 : 0
  const R = 90, cx = 110, cy = 105
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to)
    const x0 = cx + R * Math.cos(a0), y0 = cy - R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy - R * Math.sin(a1)
    return `M ${x0} ${y0} A ${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
  }
  const needle = Math.PI * (1 - frac)
  return (
    <svg viewBox="0 0 220 130" role="img" aria-label={score ? `Reply score ${score} out of 10` : 'Not enough chats yet'} style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto' }}>
      <path d={arc(0, 1)} stroke={t.surf3} strokeWidth="26" fill="none" />
      {score && <path d={arc(0, Math.max(frac, 0.02))} stroke="#7fc6bb" strokeWidth="26" fill="none" />}
      {score && <line x1={cx} y1={cy} x2={cx + (R - 4) * Math.cos(needle)} y2={cy - (R - 4) * Math.sin(needle)} stroke={t.text} strokeWidth="5" strokeLinecap="round" />}
      <text x={cx} y={cy - 32} textAnchor="middle" fill={t.text} fontSize="34" fontWeight="800">{score ?? '–'}</text>
      <text x="22" y="126" fill={t.muted} fontSize="11">Selectively</text>
      <text x="198" y="126" fill={t.muted} fontSize="11" textAnchor="end">Frequently</text>
    </svg>
  )
}

function Bars({ data, t, order }: { data: Record<string, number>; t: InsightsTheme; order?: string[] }) {
  const entries = (order ? order.filter(k => k in data).map(k => [k, data[k]] as [string, number]) : Object.entries(data).sort((a, b) => b[1] - a[1]))
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (!total) return <div style={{ fontSize: 13, color: t.dim, padding: '8px 0' }}>Not enough data yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(([label, n], i) => {
        const pct = Math.round((n / total) * 100)
        return (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.text, marginBottom: 4 }}>
              <span>{label}</span><span style={{ color: t.muted }}>{pct}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: t.surf3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: PALETTE[i % PALETTE.length] }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Insights({ theme: t, onClose }: { theme: InsightsTheme; onClose: () => void }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { setLoading(true); getInsights(days).then(d => { setData(d); setLoading(false) }) }, [days])

  const card = { background: t.surf2, border: `1px solid ${t.border}`, borderRadius: 18, padding: 18, marginBottom: 16 } as const
  const h = { fontSize: 16, fontWeight: 800, color: t.text, margin: '0 0 12px' } as const
  const label = (s: number | null) => s == null ? 'Reply to a few more chats to get a score.' : s >= 8 ? 'You reply to almost everyone.' : s >= 5 ? 'You reply to about half your chats.' : 'You reply selectively.'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 880, background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${t.border}`, background: t.surface }}>
        <button aria-label="Back" onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', background: t.surf3, color: t.text, fontSize: 20 }}>‹</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 800, color: t.text, marginRight: 40 }}>Insights</h1>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px' }}>
        <div role="tablist" aria-label="Period" style={{ display: 'flex', gap: 6, background: t.surf2, borderRadius: 14, padding: 4, marginBottom: 16 }}>
          {[7, 30, 90].map(d => (
            <button key={d} role="tab" aria-selected={days === d} onClick={() => setDays(d)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: days === d ? t.surf3 : 'transparent', color: days === d ? t.text : t.muted, fontWeight: 700, fontSize: 13 }}>
              {d} days
            </button>
          ))}
        </div>

        {loading && !data ? <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>Loading…</div> : data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {[['👀', 'Views', data.views], ['🔥', 'Likes', data.likes], ['💬', 'Chats', data.messages]].map(([icon, name, n]) => (
                <div key={name as string} style={{ ...card, marginBottom: 0, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>{icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: t.text }}>{n as number}</div>
                  <div style={{ fontSize: 12, color: t.muted }}>{name as string}</div>
                </div>
              ))}
            </div>

            <section style={card}>
              <h2 style={h}>How you reply</h2>
              <Gauge score={data.responsiveness} t={t} />
              <p style={{ fontSize: 13, color: t.muted, textAlign: 'center', margin: '8px 0 0' }}>{label(data.responsiveness)}</p>
            </section>

            <section style={card}>
              <h2 style={h}>Who's into you · by role</h2>
              <Bars data={data.by_role} t={t} />
            </section>
            <section style={card}>
              <h2 style={h}>By body type</h2>
              <Bars data={data.by_body} t={t} />
            </section>
            <section style={card}>
              <h2 style={h}>By age</h2>
              <Bars data={data.by_age} t={t} order={AGE_ORDER} />
            </section>

            <p style={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>
              Based on the {data.people} {data.people === 1 ? 'person' : 'people'} who viewed, liked or messaged you in the last {data.days} days.
              People who chose to stay out of insights aren't counted, and nobody is named. Your reply score compares the chats someone else started with how many you answered within a day.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
