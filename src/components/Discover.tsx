import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPicks, getSecondChances, since, type Pick, type SecondChance } from '../lib/insights'
import type { Profile } from '../lib/supabase'

// "Picked for you" and "Second chances" strips at the top of Nearby. Both RPCs return ids only;
// profiles come from the nearby list the app already has, so distance/age privacy rules stay in one place.

export interface DiscoverTheme { surf2: string; surf3: string; border: string; text: string; muted: string; dim: string; green: string }

const GOLD = '#e0c08a'
const REFRESH_MS = 10 * 60_000

type P = Profile & { isSeed?: boolean }

function Strip({ title, sub, children, t }: { title: string; sub: string; children: ReactNode; t: DiscoverTheme }) {
  return (
    <section aria-label={title} style={{ padding: '14px 0 4px', borderBottom: `1px solid ${t.border}` }}>
      <div style={{ padding: '0 16px 10px' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: t.text, margin: 0 }}>{title}</h2>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 12px', scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}>{children}</div>
    </section>
  )
}

function Photo({ u, h }: { u: P; h: number }) {
  return u.photo_url
    ? <img src={u.photo_url} alt="" loading="lazy" style={{ width: '100%', height: h, objectFit: 'cover', display: 'block' }} />
    : <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, background: `${u.color}33` }}>{u.emoji}</div>
}

function useCoordsKey(coords: { lat: number; lng: number } | null) {
  // Re-query only when the user has moved ~1 km, not on every GPS wobble
  return coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : null
}

export function PickedForYou({ coords, nearby, onSelect, theme: t }: { coords: { lat: number; lng: number } | null; nearby: P[]; onSelect: (u: P) => void; theme: DiscoverTheme }) {
  const [picks, setPicks] = useState<Pick[]>([])
  const key = useCoordsKey(coords)
  useEffect(() => {
    if (!coords) return
    let live = true
    const load = () => getPicks(coords.lat, coords.lng).then(p => { if (live) setPicks(p) })
    load()
    const iv = setInterval(load, REFRESH_MS)
    return () => { live = false; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const byId = useMemo(() => new Map(nearby.map(u => [u.id, u])), [nearby])
  const shown = picks.filter(p => byId.has(p.id)).slice(0, 10)
  if (!shown.length) return null

  return (
    <Strip title="Picked for you" sub="More of your type, refreshed daily" t={t}>
      {shown.map(p => {
        const u = byId.get(p.id)!
        return (
          <button key={p.id} onClick={() => onSelect(u)} aria-label={`${u.name}, picked for you`}
            style={{ flex: '0 0 148px', scrollSnapAlign: 'start', borderRadius: 16, overflow: 'hidden', background: t.surf2, border: `1px solid ${t.border}`, textAlign: 'left', position: 'relative' }}>
            <Photo u={u} h={168} />
            <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 800, color: '#000', background: GOLD, padding: '3px 9px', borderRadius: 12 }}>✦ {p.score}%</span>
            <div style={{ padding: '8px 10px 10px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u.name}{u.age ? <span style={{ color: t.muted, fontWeight: 500 }}> {u.age}</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', minHeight: 16 }}>
                {p.reasons.map(r => <span key={r} style={{ fontSize: 10, color: GOLD }}>✓ {r}</span>)}
              </div>
            </div>
          </button>
        )
      })}
    </Strip>
  )
}

export function SecondChances({ coords, nearby, distances, onSelect, theme: t }: { coords: { lat: number; lng: number } | null; nearby: P[]; distances: Map<string, number>; onSelect: (u: P) => void; theme: DiscoverTheme }) {
  const [list, setList] = useState<SecondChance[]>([])
  const key = useCoordsKey(coords)
  useEffect(() => {
    if (!coords) return
    let live = true
    const load = () => getSecondChances(coords.lat, coords.lng).then(l => { if (live) setList(l) })
    load()
    const iv = setInterval(load, REFRESH_MS)
    return () => { live = false; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const byId = useMemo(() => new Map(nearby.map(u => [u.id, u])), [nearby])
  const shown = list.filter(c => byId.has(c.id))
  if (!shown.length) return null

  const dist = (m?: number) => m === undefined ? null : m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1609.34).toFixed(1)} mi away`

  return (
    <Strip title="Second chances" sub="People you've talked to who are close again" t={t}>
      {shown.map(c => {
        const u = byId.get(c.id)!
        const d = dist(distances.get(c.id))
        return (
          <button key={c.id} onClick={() => onSelect(u)} aria-label={`${u.name}, you chatted ${since(c.last_chat_at)}`}
            style={{ flex: '0 0 272px', scrollSnapAlign: 'start', display: 'flex', borderRadius: 16, overflow: 'hidden', border: `1px solid ${t.border}`, textAlign: 'left',
              background: `linear-gradient(135deg, ${t.surf2}, rgba(224,192,138,0.10))` }}>
            <div style={{ width: 96, flexShrink: 0 }}><Photo u={u} h={124} /></div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {u.online && <span aria-label="Online" style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, flexShrink: 0 }} />}
                <span style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
              </div>
              <div style={{ fontSize: 13, color: t.text, marginTop: 6, lineHeight: 1.35 }}>
                {c.met ? `Met: ${c.met}. ` : ''}You last chatted {since(c.last_chat_at)}. {u.online ? 'Online now' : 'Back nearby'} — pick up where you left off.
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 11, color: t.dim, display: 'flex', justifyContent: 'space-between', gap: 8, whiteSpace: 'nowrap' }}>
                <span>💬 {since(c.last_chat_at)}</span>{d && <span>➤ {d}</span>}
              </div>
            </div>
          </button>
        )
      })}
    </Strip>
  )
}
