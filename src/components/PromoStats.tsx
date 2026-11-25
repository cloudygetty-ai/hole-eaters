import { useEffect, useState } from 'react'
import { getPromoStats, type PromoStat } from '../lib/referrals'

// Admin › Stats: visitors and sign-ups per promo tag (?src= on posters, stickers, cards, ads).
export interface PromoStatsTheme { surf2: string; border: string; text: string; dim: string; accent: string }

export function PromoStats({ theme: t }: { theme: PromoStatsTheme }) {
  const [rows, setRows] = useState<PromoStat[] | null>(null)
  useEffect(() => { getPromoStats(90).then(setRows) }, [])

  const cell = { padding: '8px 6px', borderTop: `1px solid ${t.border}`, fontSize: 13 } as const
  return (
    <div style={{ background: t.surf2, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Promo sources · last 90 days</div>
      <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>Visitors count once per tag per day; sign-ups are new profiles that arrived with the tag.</div>
      {rows === null ? <div style={{ fontSize: 12, color: t.dim, marginTop: 10 }}>Loading…</div>
        : rows.length === 0 ? <div style={{ fontSize: 12, color: t.dim, marginTop: 10 }}>No tagged visits yet. Links with ?src= (posters, stickers, cards, ads) show up here.</div>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, color: t.text }}>
            <thead>
              <tr style={{ fontSize: 11, color: t.dim, textAlign: 'left' }}>
                <th style={{ padding: '0 6px 6px', fontWeight: 600 }}>Source</th>
                <th style={{ padding: '0 6px 6px', fontWeight: 600, textAlign: 'right' }}>Visitors</th>
                <th style={{ padding: '0 6px 6px', fontWeight: 600, textAlign: 'right' }}>Sign-ups</th>
                <th style={{ padding: '0 6px 6px', fontWeight: 600, textAlign: 'right' }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.src}>
                  <td style={cell}>{r.src}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{r.visitors}</td>
                  <td style={{ ...cell, textAlign: 'right', color: t.accent, fontWeight: 700 }}>{r.signups}</td>
                  <td style={{ ...cell, textAlign: 'right', color: t.dim }}>{r.visitors ? `${Math.round((r.signups / r.visitors) * 100)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  )
}
