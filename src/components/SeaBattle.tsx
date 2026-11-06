import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  CELLS, FLEET, SIZE, answer, commitOf, coord, foldSea, loadBoard, newGid, randomBoard, saveBoard, verifyPlayer,
  type Board, type SeaEvent, type SeaMsg, type SeaState,
} from '../lib/seaBattle'

// Theme is passed in so this module never imports upward from App.tsx.
export interface SeaTheme { bg: string; accent: string; green: string; surf2: string; surf3: string; border2: string; text: string; muted: string; dim: string }

type Send = (msg: SeaMsg) => Promise<boolean>

/** Most recent game in this chat (by invite time), or null. */
function currentGame(events: SeaEvent[]): SeaEvent[] {
  const invites = events.filter(e => e.msg.op === 'invite').sort((a, b) => a.at.localeCompare(b.at))
  const last = invites.at(-1)
  return last ? events.filter(e => e.msg.gid === last.msg.gid) : []
}

// ── Grid ────────────────────────────────────────────────────────────────────────
type CellMark = 'ship' | 'hit' | 'miss' | 'pending' | 'sunk-ship' | null
function Grid({ marks, onTap, disabled, label, t }: { marks: (c: number) => CellMark; onTap?: (c: number) => void; disabled?: boolean; label: string; t: SeaTheme }) {
  const style = (m: CellMark): CSSProperties => ({
    aspectRatio: '1', borderRadius: 4, border: 'none', padding: 0, fontSize: 12, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: m === 'ship' ? `${t.muted}55` : m === 'hit' ? t.accent : m === 'sunk-ship' ? `${t.accent}88` : m === 'pending' ? `${t.accent}33` : t.surf3,
    color: m === 'miss' ? t.dim : '#fff', cursor: onTap && !disabled && (m === null || m === 'ship') ? 'pointer' : 'default',
  })
  return (
    <div style={{ width: 'min(100%, 320px)' }}>
      <div style={{ fontSize: 11, color: t.dim, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div role="grid" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gap: 3, width: '100%' }}>
        {Array.from({ length: CELLS }, (_, c) => {
          const m = marks(c)
          const tappable = !!onTap && !disabled && m === null
          return (
            <button key={c} type="button" role="gridcell" aria-label={`${coord(c)}${m ? ` ${m}` : ''}`} disabled={!tappable}
              onClick={() => tappable && onTap!(c)} style={style(m)}>
              {m === 'hit' || m === 'sunk-ship' ? '✕' : m === 'miss' ? '•' : m === 'pending' ? '◌' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main sheet ──────────────────────────────────────────────────────────────────
export function SeaBattleSheet({ events, myId, otherName, onSend, onClose, theme: t }: {
  events: SeaEvent[]; myId: string; otherName: string; onSend: Send; onClose: () => void; theme: SeaTheme
}) {
  const game = useMemo(() => currentGame(events), [events])
  const state = useMemo(() => foldSea(game, myId), [game, myId])
  const gid = state?.gid ?? null
  // Fleet lives in local storage; bump `rev` after saving so the memo re-reads it.
  const [rev, setRev] = useState(0)
  const board = useMemo<Board | null>(() => (gid ? loadBoard(gid, myId) : null), [gid, myId, rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Board>(() => randomBoard())
  const [busy, setBusy] = useState(false)
  const [fair, setFair] = useState<Record<string, string>>({})

  const needsSetup = !state || state.phase === 'over' || (state.phase === 'invited' && state.inviter !== myId)
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn() } finally { setBusy(false) } }

  const startGame = () => run(async () => {
    const g = newGid(); saveBoard(g, myId, draft)
    if (await onSend({ v: 1, game: 'sb', gid: g, op: 'invite', commit: await commitOf(draft) })) { setRev(r => r + 1); setDraft(randomBoard()) }
  })
  const acceptGame = () => run(async () => {
    if (!state) return
    saveBoard(state.gid, myId, draft)
    if (await onSend({ v: 1, game: 'sb', gid: state.gid, op: 'accept', commit: await commitOf(draft) })) setRev(r => r + 1)
  })

  // My answer to their pending shot, computed from my local fleet.
  const preview = useMemo(() => {
    if (!state || !board || state.incoming == null) return null
    const earlier = new Set(state.theirShots.slice(0, -1))
    return answer(board, state.incoming, earlier)
  }, [state, board])

  const fire = (c: number) => run(async () => {
    if (!state || !board || !state.myTurn) return
    await onSend({ v: 1, game: 'sb', gid: state.gid, op: 'turn', ...(preview ? { res: preview.res } : {}), shot: c })
  })
  const concede = () => run(async () => {
    if (!state || !board || !preview) return
    if (await onSend({ v: 1, game: 'sb', gid: state.gid, op: 'turn', res: preview.res, lost: true }))
      await onSend({ v: 1, game: 'sb', gid: state.gid, op: 'reveal', ...board })
  })
  const resign = () => run(async () => {
    if (!state || !window.confirm('Resign this game?')) return
    if (await onSend({ v: 1, game: 'sb', gid: state.gid, op: 'resign' }) && board) await onSend({ v: 1, game: 'sb', gid: state.gid, op: 'reveal', ...board })
  })

  // After the game, reveal my fleet once so he can verify I played fair.
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    if (!state || state.phase !== 'over' || !board || state.reveals[myId] || revealed.current === state.gid) return
    revealed.current = state.gid
    void onSend({ v: 1, game: 'sb', gid: state.gid, op: 'reveal', ...board })
  }, [state, board, myId, onSend])

  useEffect(() => {
    if (!state || state.phase !== 'over') return
    const other = state.inviter === myId ? state.opponent : state.inviter
    if (!other) return
    verifyPlayer(state, other).then(v => setFair(f => (f[state.gid] === v ? f : { ...f, [state.gid]: v })))
  }, [state, myId])

  const btn = (primary: boolean): CSSProperties => ({ flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 800, fontSize: 14, background: primary ? t.accent : t.surf3, color: primary ? '#fff' : t.text, border: `1px solid ${primary ? t.accent : t.border2}`, opacity: busy ? 0.6 : 1 })

  const status = statusLine(state, myId, otherName, board, preview?.lost ?? false)
  const shipSet = new Set(board?.ships.flat() ?? [])
  const theirHitsOnMe = new Set(state?.theirShots.filter(c => shipSet.has(c)) ?? [])

  return (
    <div role="dialog" aria-label="Sea Battle" style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxHeight: '94dvh', overflowY: 'auto', background: t.surf2, borderRadius: '22px 22px 0 0', padding: '16px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>⚓ Sea Battle <span style={{ color: t.dim, fontWeight: 400, fontSize: 13 }}>vs {otherName}</span></div>
          <button aria-label="Close" onClick={onClose} style={{ color: t.dim, fontSize: 18 }}>✕</button>
        </div>
        <div role="status" style={{ fontSize: 13, color: t.muted, marginBottom: 14, minHeight: 18 }}>{status}</div>

        {state?.phase === 'over' && (
          <FinalBanner state={state} myId={myId} fair={fair[state.gid]} t={t} />
        )}

        {needsSetup ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <Grid label={`Your fleet · ${FLEET.join('-')}`} marks={c => (draft.ships.some(s => s.includes(c)) ? 'ship' : null)} t={t} />
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 320 }}>
              <button onClick={() => setDraft(randomBoard())} disabled={busy} style={btn(false)}>🔀 Shuffle</button>
              {state?.phase === 'invited' && state.inviter !== myId
                ? <button onClick={acceptGame} disabled={busy} style={btn(true)}>Accept</button>
                : <button onClick={startGame} disabled={busy} style={btn(true)}>{state?.phase === 'over' ? 'Rematch' : 'Challenge'}</button>}
            </div>
            <div style={{ fontSize: 11, color: t.dim, textAlign: 'center', maxWidth: 320 }}>Your fleet stays on this device. A sealed fingerprint is shared now and the fleet is revealed at the end, so nobody can fudge a hit.</div>
          </div>
        ) : state && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            {!board && <div style={{ fontSize: 13, color: t.accent }}>This game's fleet is on another device. Continue there, or resign.</div>}
            <Grid label={`His waters · ${state.myHits}/14 hits`} disabled={!state.myTurn || !board || busy || preview?.lost}
              marks={c => { const s = state.myShots.get(c); return s === 'hit' ? 'hit' : s === 'miss' ? 'miss' : s === 'pending' ? 'pending' : null }}
              onTap={fire} t={t} />
            {board && (
              <Grid label={`Your fleet · ${state.theirHits}/14 hit`}
                marks={c => theirHitsOnMe.has(c) ? 'sunk-ship' : state.theirShots.includes(c) ? 'miss' : shipSet.has(c) ? 'ship' : null} t={t} />
            )}
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 320 }}>
              {preview?.lost
                ? <button onClick={concede} disabled={busy} style={btn(true)}>Fleet sunk — end game</button>
                : state.phase === 'playing' && <button onClick={resign} disabled={busy} style={btn(false)}>Resign</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function statusLine(s: SeaState | null, me: string, other: string, board: Board | null, sunk: boolean): string {
  if (!s) return `Challenge ${other}. Shuffle your fleet, then send.`
  if (s.phase === 'invited') return s.inviter === me ? `Waiting for ${other} to accept…` : `${other} challenged you. Shuffle your fleet and accept.`
  if (s.phase === 'over') return 'Game over. Shuffle for a rematch.'
  if (!board) return 'Fleet not on this device.'
  if (sunk) return `${other} sank your last ship.`
  if (s.myTurn) return s.incoming != null ? `He fired at ${coord(s.incoming)}. Your shot — tap his waters.` : 'You go first — tap his waters.'
  return `Waiting for ${other}…`
}

function FinalBanner({ state, myId, fair, t }: { state: SeaState; myId: string; fair?: string; t: SeaTheme }) {
  const won = state.winner === myId
  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 14, background: won ? `${t.green}22` : t.surf3, border: `1px solid ${won ? t.green : t.border2}` }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>{won ? '🏆 You won' : '⚓ You lost'}{state.resigned ? (state.resigned === myId ? ' (resigned)' : ' — he resigned') : ''}</div>
      <div style={{ fontSize: 12, color: fair === 'mismatch' ? t.accent : t.muted, marginTop: 4 }}>
        {fair === 'ok' ? '✓ His fleet checks out — fair game.' : fair === 'mismatch' ? '⚠ His revealed fleet doesn\'t match his answers.' : 'Waiting for his fleet reveal to verify…'}
      </div>
    </div>
  )
}

/** Compact in-chat line for a Sea Battle message. */
export function SeaChip({ text, mine, isInvite, onOpen, theme: t }: { text: string; mine: boolean; isInvite: boolean; onOpen: () => void; theme: SeaTheme }) {
  return (
    <button onClick={onOpen} style={{ maxWidth: '78%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', borderRadius: 14, padding: isInvite ? '12px 14px' : '8px 12px', background: isInvite ? `linear-gradient(135deg, ${t.accent}33, ${t.surf2})` : t.surf2, border: `1px solid ${isInvite ? `${t.accent}66` : t.border2}`, color: t.text }}>
      <span style={{ flex: 1, fontSize: isInvite ? 14 : 12, fontWeight: isInvite ? 700 : 400, color: isInvite ? t.text : t.muted }}>{text}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: t.accent }}>{isInvite && !mine ? 'Play' : 'Open'}</span>
    </button>
  )
}
