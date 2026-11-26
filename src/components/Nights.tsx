// Nights at spots: the detail sheet (from the map or the empty-map card) and the list inside a spot's
// sheet, where admins add and remove nights. Data and rules live in lib/nights.ts.
import { useState } from 'react'
import { SPOT_KINDS, type Spot } from '../lib/spots'
import { addNight, nightWhen, removeNight, rsvpNight, type Night } from '../lib/nights'
import type { SpotsTheme } from './Spots'

const NIGHT = '#B18A55'
const overlay = { position: 'fixed' as const, inset: 0, zIndex: 870, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end' }
const sheet = (t: SpotsTheme) => ({ width: '100%', maxHeight: '86dvh', overflowY: 'auto' as const, background: t.surface, borderRadius: '22px 22px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))', borderTop: `1px solid ${t.border2}` })
const btn = (t: SpotsTheme, on = false) => ({ flex: 1, padding: '11px 8px', borderRadius: 12, fontWeight: 700, fontSize: 13, background: on ? `${t.green}22` : t.surf3, border: `1px solid ${on ? t.green : t.border2}`, color: on ? t.green : t.text, textAlign: 'center' as const, textDecoration: 'none' })

export interface NightCallbacks {
  pushOn: boolean
  onEnablePush: () => void
  onPatch: (id: string, change: Partial<Night>) => void
  onOpenRoom: (roomId: string) => void
}

/** "I'm going" + "Join the room" for one night. Going doubles as the start-of-night ping. */
function NightActions({ night: n, theme: t, cb }: { night: Night; theme: SpotsTheme; cb: NightCallbacks }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const toggle = async () => {
    setBusy(true); setNote(null)
    const r = await rsvpNight(n.id, !n.i_am_going)
    setBusy(false)
    if (r.error || r.going === null) { setNote("Couldn't save that. Try again."); return }
    cb.onPatch(n.id, { i_am_going: !n.i_am_going, going: r.going })
  }
  const live = n.live || new Date(n.starts_at) <= new Date()
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {live && n.room_id
          ? <button onClick={() => cb.onOpenRoom(n.room_id!)} style={{ ...btn(t), background: NIGHT, border: `1px solid ${NIGHT}`, color: '#1a1200' }}>📡 Join the room</button>
          : null}
        <button disabled={busy} aria-pressed={n.i_am_going} onClick={toggle} style={btn(t, n.i_am_going)}>
          {n.i_am_going ? '✓ Going · Undo' : "🙋 I'm going"}
        </button>
      </div>
      {n.i_am_going && !live && (cb.pushOn
        ? <div style={{ fontSize: 12, color: t.muted, marginTop: 8 }}>We'll ping you when it starts.</div>
        : <div style={{ fontSize: 12, color: t.muted, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>Turn on notifications to get a ping when it starts.</span>
            <button onClick={cb.onEnablePush} style={{ padding: '6px 10px', borderRadius: 9, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text, fontSize: 12, fontWeight: 700 }}>Turn on</button>
          </div>)}
      {note && <div role="status" style={{ fontSize: 12, color: t.amber, marginTop: 8 }}>{note}</div>}
    </>
  )
}

const goingLabel = (n: Night) => n.going === 0 ? 'Be the first to say you’re going' : `${n.going} going`

export function NightSheet({ night: n, theme: t, isAdmin, cb, onClose, onRemoved }: {
  night: Night; theme: SpotsTheme; isAdmin: boolean; cb: NightCallbacks; onClose: () => void; onRemoved: () => void
}) {
  const kind = SPOT_KINDS[n.spot_kind] ?? SPOT_KINDS.other
  const [err, setErr] = useState<string | null>(null)
  const remove = async () => {
    if (!window.confirm(`Remove "${n.title}"? Its room closes too.`)) return
    const e = await removeNight(n.id)
    if (e) setErr(e); else onRemoved()
  }
  return (
    <div style={overlay} onClick={onClose}>
      <div role="dialog" aria-label={n.title} onClick={e => e.stopPropagation()} style={sheet(t)}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `${NIGHT}22`, border: `2px solid ${NIGHT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌙</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
            <div style={{ fontSize: 12, color: t.muted }}>{kind.icon} {n.spot_name}</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', background: t.surf3, color: t.muted, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, color: t.muted, marginBottom: 12 }}>
          <span style={{ color: nightWhen(n) === 'Live now' ? t.green : NIGHT, fontWeight: 700 }}>{nightWhen(n)}</span>
          <span>{goingLabel(n)}</span>
        </div>
        <NightActions night={n} theme={t} cb={cb} />
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lng}`} target="_blank" rel="noopener noreferrer" style={btn(t)}>🧭 Directions</a>
        </div>
        <p style={{ fontSize: 11, color: t.dim, lineHeight: 1.5, margin: 0 }}>The room opens when the night starts and closes when it ends. Who's going stays private; only the count shows.</p>
        {isAdmin && <button onClick={remove} style={{ marginTop: 12, fontSize: 12, color: '#ef4444' }}>Remove this night</button>}
        {err && <div role="status" style={{ fontSize: 12, color: t.amber, marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  )
}

// datetime-local wants local time without a zone: "2026-11-28T21:00"
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
function nextNinePm() {
  const d = new Date(); d.setHours(21, 0, 0, 0)
  if (d <= new Date()) d.setDate(d.getDate() + 1)
  return d
}

/** Nights at one spot, shown inside its sheet. Admins can add and remove them here. */
export function SpotNights({ spot, nights, theme: t, isAdmin, cb, onChanged }: {
  spot: Spot; nights: Night[]; theme: SpotsTheme; isAdmin: boolean; cb: NightCallbacks; onChanged: () => void
}) {
  const here = nights.filter(n => n.spot_id === spot.id)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(() => localInput(nextNinePm()))
  const [hours, setHours] = useState(4)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (spot.status !== 'approved' || (!here.length && !isAdmin)) return null

  const save = async () => {
    const s = new Date(start)
    if (title.trim().length < 2 || Number.isNaN(s.getTime())) { setErr('Add a name and a start time.'); return }
    setBusy(true); setErr(null)
    const e = await addNight(spot.id, title, s, new Date(s.getTime() + hours * 3_600_000))
    setBusy(false)
    if (e) { setErr(e); return }
    setAdding(false); setTitle(''); onChanged()
  }
  const remove = async (n: Night) => {
    if (!window.confirm(`Remove "${n.title}"? Its room closes too.`)) return
    const e = await removeNight(n.id)
    if (e) setErr(e); else onChanged()
  }
  const field = { width: '100%', padding: '10px 12px', borderRadius: 10, background: t.surf3, border: `1px solid ${t.border2}`, color: t.text, fontSize: 14 }

  return (
    <section aria-label="Nights here" style={{ margin: '4px 0 12px', padding: 12, borderRadius: 14, background: `${NIGHT}12`, border: `1px solid ${NIGHT}44` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: NIGHT, marginBottom: 8 }}>🌙 Nights here</div>
      {here.map(n => (
        <div key={n.id} style={{ padding: '8px 0', borderTop: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: t.text }}>{n.title}</div>
            <div style={{ fontSize: 12, color: t.muted }}>{nightWhen(n)} · {n.going} going</div>
          </div>
          <NightActions night={n} theme={t} cb={cb} />
          {isAdmin && <button onClick={() => remove(n)} style={{ marginTop: 6, fontSize: 12, color: '#ef4444' }}>Remove</button>}
        </div>
      ))}
      {!here.length && <div style={{ fontSize: 12, color: t.muted, marginBottom: 8 }}>No nights planned here yet.</div>}
      {isAdmin && (adding ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <input aria-label="Night name" placeholder="e.g. Thursday Social" maxLength={40} value={title} onChange={e => setTitle(e.target.value)} style={field} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input aria-label="Starts" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={{ ...field, flex: 2 }} />
            <select aria-label="Length" value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...field, flex: 1 }}>
              {[2, 3, 4, 5, 6, 8].map(h => <option key={h} value={h}>{h} hours</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAdding(false); setErr(null) }} style={btn(t)}>Cancel</button>
            <button disabled={busy} onClick={save} style={{ ...btn(t), background: NIGHT, border: `1px solid ${NIGHT}`, color: '#1a1200' }}>Add night</button>
          </div>
        </div>
      ) : <button onClick={() => setAdding(true)} style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: NIGHT }}>＋ Add a night</button>)}
      {err && <div role="status" style={{ fontSize: 12, color: t.amber, marginTop: 8 }}>{err}</div>}
    </section>
  )
}
