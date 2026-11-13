import { useEffect, useState } from 'react'
import { HOLD_REASONS, listHolds, releaseHold, type HoldReason, type LegalHold } from '../lib/legalHolds'
import type { VideoTheme } from './VideoFeed'

const reasonLabel = (r: HoldReason) => HOLD_REASONS.find(x => x.id === r)?.label ?? r

// Admin tab. Members are never shown whether they are held.
export function LegalHolds({ theme: t }: { theme: VideoTheme }) {
  const [holds, setHolds] = useState<LegalHold[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = () => listHolds().then(setHolds).catch(e => { console.error('[legal-hold] list', e); setErr('Couldn’t load holds.'); setHolds([]) })
  useEffect(() => { load() }, [])

  const release = async (h: LegalHold) => {
    const msg = h.closed_at
      ? 'Release hold? They already deleted their account, so ALL their data and the preserved copies will be permanently erased now.'
      : 'Release hold? Preserved copies will be erased; their live account is untouched.'
    if (!window.confirm(msg)) return
    setBusy(h.user_id)
    try { await releaseHold(h.user_id); await load() } catch (e) { setErr(`Release failed: ${e instanceof Error ? e.message : e}`) }
    setBusy(null)
  }

  if (!holds) return <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>Loading…</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>
        Held accounts can't be erased. If the member deletes their account, it's closed and hidden instead, and they see the normal "deleted" result. Place holds from the Users tab.
      </div>
      {err && <div role="alert" style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
      {holds.length === 0 && <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>No active holds</div>}
      {holds.map(h => (
        <div key={h.user_id} style={{ background: t.surf2, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{h.profile?.emoji} {h.profile?.name ?? h.user_id}</div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>{reasonLabel(h.reason)}{h.reference ? ` · ${h.reference}` : ''}</div>
          <div style={{ fontSize: 12, color: t.dim, marginTop: 4 }}>
            Since {new Date(h.placed_at).toLocaleDateString()} · {h.evidence_rows} records
            {h.closed_at && <span style={{ color: '#f59e0b' }}> · Account closed {new Date(h.closed_at).toLocaleDateString()}</span>}
          </div>
          <button disabled={busy === h.user_id} onClick={() => release(h)} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: t.surf3, color: t.muted, fontWeight: 700, fontSize: 12 }}>
            {busy === h.user_id ? 'Releasing…' : 'Release hold'}
          </button>
        </div>
      ))}
    </div>
  )
}
