import { useEffect, useState } from 'react'
import { getProfileInsight, type ProfileInsight as Data, type Position } from '../lib/insights'
import { optionLabel } from '../lib/profileDetails'

// "Insights" block on someone's profile: what they seem to be (from who they go for), what they've
// been into lately, and how well you match. Renders nothing until there's enough activity.

export interface ProfileInsightTheme { surf3: string; border: string; text: string; muted: string; dim: string }

const GOLD = '#e0c08a'
const ROWS: [Position, string][] = [['top', 'Top'], ['vers', 'Vers'], ['bottom', 'Bottom'], ['side', 'Side']]

export function HowInsightsWorks({ theme: t, onClose }: { theme: ProfileInsightTheme; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="hiw-title" style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#1c1c1f', borderRadius: '24px 24px 0 0', padding: '12px 28px calc(28px + env(safe-area-inset-bottom))', animation: 'slideUp 0.25s ease' }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: t.dim, margin: '0 auto 28px' }} />
        <h2 id="hiw-title" style={{ fontSize: 24, fontWeight: 800, color: t.text, margin: '0 0 14px' }}>How Insights works</h2>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: t.text, margin: '0 0 14px' }}>
          Insights looks at who someone views, likes and starts chats with on Hole Eaters to give you a clearer picture of what they're into. It never reads messages.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: t.text, margin: '0 0 14px' }}>
          Then it compares your profile with their activity to show how well you match up.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: t.muted, margin: '0 0 24px' }}>
          Don't want your own activity used? Turn off Profile Insights in Settings → Privacy.
        </p>
        <button onClick={onClose} style={{ width: '100%', padding: 18, borderRadius: 32, background: '#fff', color: '#000', fontSize: 17, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' }}>Got it</button>
      </div>
    </div>
  )
}

function MatchRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${pct}% match`}>
      <circle cx="32" cy="32" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
      <circle cx="32" cy="32" r={r} stroke={GOLD} strokeWidth="6" fill="none" strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{pct}%</text>
    </svg>
  )
}

export function ProfileInsightCard({ targetId, theme: t }: { targetId: string; theme: ProfileInsightTheme }) {
  // Keyed by target so a stale result never shows on the next profile
  const [res, setRes] = useState<{ id: string; data: Data | null } | null>(null)
  const [help, setHelp] = useState(false)
  useEffect(() => {
    let live = true
    getProfileInsight(targetId).then(data => { if (live) setRes({ id: targetId, data }) })
    return () => { live = false }
  }, [targetId])
  const data = res?.id === targetId ? res.data : null

  if (!data?.enough || !data.bars) return null
  const max = Math.max(...Object.values(data.bars), 0.01)

  return (
    <section aria-label="Insights" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted, margin: 0 }}>Insights</h3>
        <button aria-label="How Insights works" onClick={() => setHelp(true)}
          style={{ width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${t.muted}`, color: t.muted, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>i</button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: t.dim }}>From activity with {data.people} people</span>
      </div>

      {typeof data.match === 'number' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <MatchRing pct={data.match} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
              {data.match >= 75 ? 'Strong match' : data.match >= 50 ? 'Good match' : 'Some overlap'}
            </div>
            {!!data.reasons?.length && (
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                {data.reasons.map(r => (
                  <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: t.text }}>
                    <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', background: GOLD, color: '#000', fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>{r}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div role="list" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 12, rowGap: 9 }}>
        {ROWS.map(([k, label]) => (
          <div role="listitem" key={k} style={{ display: 'contents' }}>
            <span style={{ fontSize: 14, color: t.muted, textAlign: 'right' }}>{label}</span>
            <div aria-label={`${label} ${Math.round(data.bars![k] * 100)}%`} style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(3, (data.bars![k] / max) * 100)}%`, height: '100%', borderRadius: 5,
                background: `linear-gradient(90deg, #6b6d7d, ${GOLD} ${data.bars![k] === max ? '100%' : '160%'})`, transition: 'width .5s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {!!data.into?.length && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: t.dim, marginBottom: 6 }}>Into lately</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.into.map(tag => (
              <span key={tag} style={{ fontSize: 12, color: GOLD, background: 'rgba(224,192,138,0.12)', border: '1px solid rgba(224,192,138,0.25)', padding: '4px 10px', borderRadius: 12 }}>{optionLabel(tag)}</span>
            ))}
          </div>
        </div>
      )}

      {help && <HowInsightsWorks theme={t} onClose={() => setHelp(false)} />}
    </section>
  )
}
