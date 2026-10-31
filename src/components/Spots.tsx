import { useEffect, useState } from 'react'
import { VENUE, COMMUNITY } from '../lib/spotMarker'
import { SPOT_KINDS, REPORT_REASONS, addSpot, checkInSpot, checkOutSpot, voteSpot, reportSpot, getSpotsForReview, moderateSpot,
  type Spot, type SpotKind, type SpotForReview } from '../lib/spots'

// Cruising spot UI: detail sheet, add-spot sheet and the admin review queue. Map pins: lib/spotMarker.ts

export interface SpotsTheme { bg: string; surface: string; surf2: string; surf3: string; border: string; border2: string; text: string; muted: string; dim: string; accent: string; green: string; amber: string }

const sheet = (t: SpotsTheme) => ({ width: '100%', maxHeight: '86dvh', overflowY: 'auto' as const, background: t.surface, borderRadius: '22px 22px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))', borderTop: `1px solid ${t.border2}` })
const overlay = { position: 'fixed' as const, inset: 0, zIndex: 870, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end' }
const SAFETY = 'Be discreet and respectful, and know local laws: sex in public places is illegal in many areas. Meet in public first, tell a friend where you are, and leave if anything feels off.'

export function SpotSheet({ spot, theme: t, onClose, onChanged }: { spot: Spot; theme: SpotsTheme; onClose: () => void; onChanged: () => void }) {
  const [s, setS] = useState(spot)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const kind = SPOT_KINDS[s.kind] ?? SPOT_KINDS.other
  const color = s.source === 'osm' ? VENUE : COMMUNITY
  const run = async (f: () => Promise<string | null>) => { setBusy(true); setNote(null); const err = await f(); setBusy(false); if (err) setNote(err); else onChanged() }

  const checkIn = () => run(async () => {
    if (s.checked_in) { await checkOutSpot(s.id); setS({ ...s, checked_in: false, here_now: Math.max(0, s.here_now - 1) }); return null }
    const r = await checkInSpot(s.id)
    if (!r.error) setS({ ...s, checked_in: true, here_now: r.hereNow })
    return r.error
  })
  const vote = (active: boolean) => run(async () => {
    const err = await voteSpot(s.id, active)
    if (!err) {
      const prev = s.my_vote
      setS({ ...s, my_vote: active,
        active_votes: s.active_votes + (active ? 1 : 0) - (prev === true ? 1 : 0),
        gone_votes: s.gone_votes + (active ? 0 : 1) - (prev === false ? 1 : 0) })
    }
    return err
  })
  const report = (reason: string) => run(async () => {
    const err = await reportSpot(s.id, reason)
    if (!err) { setReporting(false); setNote('Thanks — an admin will take a look.') }
    return err
  })

  const btn = (on: boolean) => ({ flex: 1, padding: '11px 8px', borderRadius: 12, fontWeight: 700, fontSize: 13, background: on ? `${t.green}22` : t.surf3, border: `1px solid ${on ? t.green : t.border2}`, color: on ? t.green : t.text })

  return (
    <div style={overlay} onClick={onClose}>
      <div role="dialog" aria-label={s.name} onClick={e => e.stopPropagation()} style={sheet(t)}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `${color}22`, border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{kind.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
            <div style={{ fontSize: 12, color: t.muted }}>{kind.label} · {s.source === 'osm' ? 'Venue from OpenStreetMap' : 'Community spot'}</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', background: t.surf3, color: t.muted, fontSize: 16 }}>✕</button>
        </div>

        {s.status === 'pending' && <div style={{ fontSize: 12, color: t.amber, background: `${t.amber}18`, borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>⏳ Waiting for review. Only you can see it until an admin approves it.</div>}
        {s.status === 'near_school' && <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,.12)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>This spot was removed because it's within 150 m of a school or playground.</div>}

        {s.description && <p style={{ fontSize: 14, color: t.text, lineHeight: 1.45, margin: '4px 0 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.description}</p>}

        {s.status === 'approved' && <>
          <div style={{ display: 'flex', gap: 14, fontSize: 13, color: t.muted, marginBottom: 12 }}>
            <span style={{ color: s.here_now ? t.green : t.muted }}>● {s.here_now} here now</span>
            <span>👍 {s.active_votes} still active</span>
            <span>👎 {s.gone_votes} gone</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button disabled={busy} onClick={checkIn} style={btn(s.checked_in)}>{s.checked_in ? '✓ Checked in · Leave' : "📍 I'm here"}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button disabled={busy} onClick={() => vote(true)} style={btn(s.my_vote === true)}>👍 Still active</button>
            <button disabled={busy} onClick={() => vote(false)} style={btn(s.my_vote === false)}>👎 Gone</button>
          </div>
        </>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer"
            style={{ ...btn(false), textAlign: 'center', textDecoration: 'none' }}>🧭 Directions</a>
          {s.website && <a href={s.website} target="_blank" rel="noopener noreferrer nofollow" style={{ ...btn(false), textAlign: 'center', textDecoration: 'none' }}>🌐 Website</a>}
        </div>

        {note && <div role="status" style={{ fontSize: 13, color: t.amber, marginBottom: 10 }}>{note}</div>}

        {s.status === 'approved' && !s.mine && (reporting ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {REPORT_REASONS.map(r => <button key={r.id} disabled={busy} onClick={() => report(r.id)} style={{ padding: '8px 11px', borderRadius: 10, fontSize: 12, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text }}>{r.label}</button>)}
          </div>
        ) : <button onClick={() => setReporting(true)} style={{ fontSize: 12, color: t.dim, marginBottom: 10 }}>⚑ Report this spot</button>)}

        <p style={{ fontSize: 11, color: t.dim, lineHeight: 1.5, margin: 0 }}>{SAFETY}{s.source === 'osm' ? ' Venue data © OpenStreetMap contributors.' : ''}</p>
      </div>
    </div>
  )
}

export function AddSpotSheet({ at, theme: t, onClose, onAdded }: { at: { lat: number; lng: number }; theme: SpotsTheme; onClose: () => void; onAdded: () => void }) {
  const [kind, setKind] = useState<SpotKind | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const contact = /(https?:\/\/|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})/i
  const bad = contact.test(name) || contact.test(desc)
  const ready = !!kind && name.trim().length >= 2 && !bad && !busy
  const submit = async () => {
    if (!ready) return
    setBusy(true); setErr(null)
    const r = await addSpot({ kind: kind!, name: name.trim(), description: desc.trim(), lat: at.lat, lng: at.lng })
    setBusy(false)
    if (r.error) setErr(r.error); else onAdded()
  }
  const field = { width: '100%', boxSizing: 'border-box' as const, padding: 12, borderRadius: 12, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text, fontSize: 14 }
  return (
    <div style={overlay} onClick={onClose}>
      <div role="dialog" aria-label="Add a spot" onClick={e => e.stopPropagation()} style={sheet(t)}>
        <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 4 }}>Add a spot</div>
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 12 }}>Pinned where the map is centred. Spots are reviewed before anyone else sees them.</div>
        <div role="radiogroup" aria-label="Kind of spot" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(Object.keys(SPOT_KINDS) as SpotKind[]).map(k => (
            <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              style={{ padding: '8px 11px', borderRadius: 20, fontSize: 13, background: kind === k ? `${COMMUNITY}22` : t.surf3, border: `1px solid ${kind === k ? COMMUNITY : t.border2}`, color: kind === k ? COMMUNITY : t.text }}>
              {SPOT_KINDS[k].icon} {SPOT_KINDS[k].label}
            </button>
          ))}
        </div>
        <input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Name (e.g. Ramble north trail)" aria-label="Spot name" style={{ ...field, marginBottom: 8 }} />
        <textarea value={desc} maxLength={500} onChange={e => setDesc(e.target.value)} placeholder="Tips: best times, where exactly, what to expect (optional)" aria-label="Tips" rows={3} style={{ ...field, resize: 'none', marginBottom: 6 }} />
        <div style={{ fontSize: 12, minHeight: 18, color: '#ef4444', marginBottom: 6 }}>{bad ? 'No phone numbers or links in spots.' : err}</div>
        <button onClick={submit} disabled={!ready} style={{ width: '100%', padding: 14, borderRadius: 14, background: t.accent, color: '#fff', fontWeight: 800, fontSize: 15, opacity: ready ? 1 : 0.5 }}>{busy ? 'Sending…' : 'Send for review'}</button>
        <p style={{ fontSize: 11, color: t.dim, lineHeight: 1.5, margin: '10px 0 0' }}>Spots within 150 m of a school or playground are removed automatically. No private homes or people's addresses. {SAFETY}</p>
      </div>
    </div>
  )
}

const REASON_LABEL: Record<string, string> = Object.fromEntries(REPORT_REASONS.map(r => [r.id, r.label]))

export function SpotsReviewQueue({ theme: t, onCount }: { theme: SpotsTheme; onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<SpotForReview[] | null>(null)
  useEffect(() => { getSpotsForReview().then(r => { setRows(r); onCount?.(r.length) }) }, [onCount])
  const act = async (id: string, status: 'approved' | 'hidden') => {
    await moderateSpot(id, status)
    setRows(prev => { const next = (prev ?? []).filter(r => r.id !== id); onCount?.(next.length); return next })
  }
  if (!rows) return <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>Loading…</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: t.dim }}>New community spots, and approved spots someone reported. Spots near schools or playgrounds are removed before they reach this list.</div>
      {rows.length === 0 && <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>Nothing to review 🎉</div>}
      {rows.map(r => (
        <div key={r.id} style={{ background: t.surf2, border: `1px solid ${r.reports ? 'rgba(239,68,68,.45)' : t.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{SPOT_KINDS[r.kind]?.icon} {r.name}</div>
          <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>
            {SPOT_KINDS[r.kind]?.label} · {r.source === 'osm' ? 'OpenStreetMap' : `by ${r.creator_name ?? 'Unknown'}`} · {new Date(r.created_at).toLocaleDateString()}
            {r.school_check === 'unavailable' && <span style={{ color: t.amber }}> · school check didn't run, look at the map</span>}
          </div>
          {r.description && <div style={{ fontSize: 13, color: t.muted, marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.description}</div>}
          {r.reports > 0 && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>⚑ {r.reports} report{r.reports > 1 ? 's' : ''}: {r.reasons.map(x => REASON_LABEL[x] ?? x).join(', ')}</div>}
          <a href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 12, color: t.accent, marginTop: 6 }}>View on map ↗</a>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => act(r.id, 'approved')} style={{ flex: 1, padding: 8, borderRadius: 8, background: `${t.green}22`, border: `1px solid ${t.green}55`, color: t.green, fontWeight: 700, fontSize: 12 }}>{r.status === 'approved' ? 'Keep' : 'Approve'}</button>
            <button onClick={() => act(r.id, 'hidden')} style={{ flex: 1, padding: 8, borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontWeight: 700, fontSize: 12 }}>Hide</button>
          </div>
        </div>
      ))}
    </div>
  )
}
