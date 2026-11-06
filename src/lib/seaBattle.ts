// Sea Battle (Battleship) over E2EE chat. No server state: every move is a chat message (`g` field),
// and the game is a pure fold over those messages. Each player's fleet stays on their device;
// fairness comes from commit-reveal — a SHA-256 commitment is posted at the start and the fleet is
// revealed at the end, so any lied-about hit/miss is detectable by the other side.

export const SIZE = 8
export const CELLS = SIZE * SIZE
export const FLEET = [4, 3, 3, 2, 2] as const
const FLEET_CELLS = FLEET.reduce((a, b) => a + b, 0)

export interface Board { ships: number[][]; salt: string }
export interface ShotResult { c: number; hit: boolean; sunk?: number }

interface Base { v: 1; game: 'sb'; gid: string }
export type SeaMsg =
  | Base & { op: 'invite'; commit: string }
  | Base & { op: 'accept'; commit: string }
  | Base & { op: 'turn'; res?: ShotResult; shot?: number; lost?: true }
  | Base & { op: 'reveal'; ships: number[][]; salt: string }
  | Base & { op: 'resign' }

/** A sea message attached to its chat row. */
export interface SeaEvent { id: string; sender: string; at: string; msg: SeaMsg }

// ── Coordinates ────────────────────────────────────────────────────────────────
export const coord = (c: number) => `${'ABCDEFGH'[c % SIZE]}${Math.floor(c / SIZE) + 1}`
const isCell = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < CELLS

// ── Validation of untrusted payloads ────────────────────────────────────────────
const HEX64 = /^[0-9a-f]{64}$/
const GID = /^[a-z0-9]{6,16}$/

function asResult(x: unknown): ShotResult | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (!isCell(r.c) || typeof r.hit !== 'boolean') return null
  if (r.sunk != null && !(FLEET as readonly number[]).includes(r.sunk as number)) return null
  return { c: r.c, hit: r.hit, ...(r.sunk != null ? { sunk: r.sunk as number } : {}) }
}

function asShips(x: unknown): number[][] | null {
  if (!Array.isArray(x) || x.length !== FLEET.length) return null
  if (!x.every(s => Array.isArray(s) && s.length <= 4 && s.every(isCell))) return null
  return x as number[][]
}

export function asSeaMsg(x: unknown): SeaMsg | null {
  if (!x || typeof x !== 'object') return null
  const g = x as Record<string, unknown>
  if (g.v !== 1 || g.game !== 'sb' || typeof g.gid !== 'string' || !GID.test(g.gid)) return null
  const base: Base = { v: 1, game: 'sb', gid: g.gid }
  switch (g.op) {
    case 'invite':
    case 'accept':
      return typeof g.commit === 'string' && HEX64.test(g.commit) ? { ...base, op: g.op, commit: g.commit } : null
    case 'turn': {
      const res = g.res == null ? undefined : asResult(g.res)
      if (res === null) return null
      if (g.shot != null && !isCell(g.shot)) return null
      return { ...base, op: 'turn', ...(res ? { res } : {}), ...(g.shot != null ? { shot: g.shot as number } : {}), ...(g.lost === true ? { lost: true as const } : {}) }
    }
    case 'reveal': {
      const ships = asShips(g.ships)
      return ships && typeof g.salt === 'string' && /^[0-9a-f]{32}$/.test(g.salt) ? { ...base, op: 'reveal', ships, salt: g.salt } : null
    }
    case 'resign': return { ...base, op: 'resign' }
    default: return null
  }
}

// ── Fleet generation + commitment ───────────────────────────────────────────────
const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n
const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')

export const newGid = () => hex(crypto.getRandomValues(new Uint8Array(5)))

export function randomBoard(): Board {
  for (;;) { // retry is astronomically rare on 8×8 with 14 cells
    const used = new Set<number>()
    const ships: number[][] = []
    for (const len of FLEET) {
      let placed: number[] | null = null
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horiz = rnd(2) === 0
        const r = rnd(horiz ? SIZE : SIZE - len + 1), c = rnd(horiz ? SIZE - len + 1 : SIZE)
        const cells = Array.from({ length: len }, (_, i) => horiz ? r * SIZE + c + i : (r + i) * SIZE + c)
        if (cells.every(x => !used.has(x))) placed = cells
      }
      if (!placed) break
      placed.forEach(x => used.add(x)); ships.push(placed)
    }
    if (ships.length === FLEET.length) return { ships, salt: hex(crypto.getRandomValues(new Uint8Array(16))) }
  }
}

export async function commitOf(b: Board): Promise<string> {
  const text = `${b.salt}|${b.ships.map(s => s.join(',')).join(';')}`
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

/** Fleet shape check: right lengths, straight, contiguous, in bounds, no overlap. */
export function validFleet(ships: number[][]): boolean {
  const lens = ships.map(s => s.length).sort((a, b) => b - a)
  if (lens.join() !== [...FLEET].join()) return false
  const all = ships.flat()
  if (new Set(all).size !== FLEET_CELLS) return false
  return ships.every(s => {
    const sorted = [...s].sort((a, b) => a - b)
    const horiz = sorted.every(c => Math.floor(c / SIZE) === Math.floor(sorted[0] / SIZE))
    const step = horiz ? 1 : SIZE
    return sorted.every((c, i) => i === 0 || c - sorted[i - 1] === step)
  })
}

// ── Answering a shot from my own fleet ──────────────────────────────────────────
export function answer(board: Board, shot: number, alreadyHit: ReadonlySet<number>): { res: ShotResult; lost: boolean } {
  const ship = board.ships.find(s => s.includes(shot))
  if (!ship) return { res: { c: shot, hit: false }, lost: false }
  const hits = new Set(alreadyHit).add(shot)
  const sunk = ship.every(c => hits.has(c))
  const lost = board.ships.flat().every(c => hits.has(c))
  return { res: { c: shot, hit: true, ...(sunk ? { sunk: ship.length } : {}) }, lost }
}

// ── State: pure fold over the game's messages ───────────────────────────────────
export type Phase = 'invited' | 'playing' | 'over'
export interface SeaState {
  gid: string
  inviter: string
  opponent: string | null
  phase: Phase
  myTurn: boolean
  /** Cells I fired at → outcome (undefined = awaiting answer). */
  myShots: Map<number, 'hit' | 'miss' | 'pending'>
  /** Cells they fired at on my board. */
  theirShots: number[]
  /** Their shot I still need to answer on my next turn. */
  incoming: number | null
  myHits: number
  theirHits: number
  sunkByMe: number[]
  winner: string | null
  resigned: string | null
  commits: Record<string, string>
  reveals: Record<string, { ships: number[][]; salt: string }>
  /** Results each player reported, for post-game verification. */
  reported: Record<string, ShotResult[]>
}

export function foldSea(events: SeaEvent[], myId: string): SeaState | null {
  const evs = [...events].sort((a, b) => a.at.localeCompare(b.at))
  const invite = evs.find(e => e.msg.op === 'invite')
  if (!invite || invite.msg.op !== 'invite') return null
  const s: SeaState = {
    gid: invite.msg.gid, inviter: invite.sender, opponent: null, phase: 'invited', myTurn: false,
    myShots: new Map(), theirShots: [], incoming: null, myHits: 0, theirHits: 0, sunkByMe: [],
    winner: null, resigned: null, commits: { [invite.sender]: invite.msg.commit }, reveals: {}, reported: {},
  }
  let expect: string | null = null // whose turn message is valid next
  let lastShot: { by: string; c: number } | null = null

  for (const e of evs) {
    const m = e.msg
    if (m.op === 'accept' && !s.opponent && e.sender !== s.inviter) {
      s.opponent = e.sender; s.commits[e.sender] = m.commit; s.phase = 'playing'; expect = s.inviter
      continue
    }
    if (m.op === 'reveal' && s.opponent && (e.sender === s.inviter || e.sender === s.opponent)) { s.reveals[e.sender] = { ships: m.ships, salt: m.salt }; continue }
    if (m.op === 'resign' && s.phase !== 'over' && (e.sender === s.inviter || e.sender === s.opponent)) {
      s.phase = 'over'; s.resigned = e.sender; s.winner = e.sender === s.inviter ? s.opponent : s.inviter
      continue
    }
    if (m.op !== 'turn' || s.phase !== 'playing' || e.sender !== expect) continue

    // The result must answer the previous shot exactly; anything else is ignored.
    if (lastShot && (!m.res || m.res.c !== lastShot.c)) continue
    if (m.res && lastShot) {
      ;(s.reported[e.sender] ??= []).push(m.res)
      if (lastShot.by === myId) {
        s.myShots.set(m.res.c, m.res.hit ? 'hit' : 'miss')
        if (m.res.hit) s.myHits++
        if (m.res.sunk) s.sunkByMe.push(m.res.sunk)
      } else if (m.res.hit) s.theirHits++
    }
    if (m.lost) { s.phase = 'over'; s.winner = e.sender === s.inviter ? s.opponent : s.inviter; lastShot = null; continue }
    if (m.shot == null) continue
    lastShot = { by: e.sender, c: m.shot }
    if (e.sender === myId) s.myShots.set(m.shot, 'pending')
    else s.theirShots.push(m.shot)
    expect = e.sender === s.inviter ? s.opponent : s.inviter
  }

  if (s.phase === 'playing') {
    s.myTurn = expect === myId
    s.incoming = s.myTurn && lastShot && lastShot.by !== myId ? lastShot.c : null
  }
  return s
}

/** Post-game fairness check of one player's revealed fleet against their commitment and answers. */
export async function verifyPlayer(s: SeaState, player: string): Promise<'ok' | 'mismatch' | 'unrevealed'> {
  const r = s.reveals[player]
  if (!r) return 'unrevealed'
  if (!validFleet(r.ships) || (await commitOf(r)) !== s.commits[player]) return 'mismatch'
  const cells = new Set(r.ships.flat())
  return (s.reported[player] ?? []).every(res => res.hit === cells.has(res.c)) ? 'ok' : 'mismatch'
}

/** Plain-text fallback carried in `t` for clients without the game. */
export function seaFallback(m: SeaMsg): string {
  switch (m.op) {
    case 'invite': return '⚓ Challenged you to Sea Battle'
    case 'accept': return '⚓ Accepted Sea Battle — game on'
    case 'resign': return '⚓ Resigned Sea Battle'
    case 'reveal': return '⚓ Revealed fleet'
    case 'turn': {
      const parts: string[] = []
      if (m.res) parts.push(`${coord(m.res.c)}: ${m.res.sunk ? `sunk (${m.res.sunk})` : m.res.hit ? 'hit' : 'miss'}`)
      if (m.lost) parts.push('fleet destroyed')
      if (m.shot != null) parts.push(`fires at ${coord(m.shot)}`)
      return `⚓ ${parts.join(' · ')}`
    }
  }
}

// ── Local fleet storage (never leaves this device until the reveal) ─────────────
const key = (gid: string, me: string) => `he_sb_${me}_${gid}`
const mem = new Map<string, Board>() // fallback when storage is blocked (private mode)
export function saveBoard(gid: string, me: string, b: Board) {
  mem.set(key(gid, me), b)
  try { localStorage.setItem(key(gid, me), JSON.stringify(b)) } catch { /* mem copy covers this session */ }
}
export function loadBoard(gid: string, me: string): Board | null {
  const cached = mem.get(key(gid, me))
  if (cached) return cached
  try {
    const raw = localStorage.getItem(key(gid, me))
    if (!raw) return null
    const b = JSON.parse(raw) as Board
    return validFleet(b.ships) ? b : null
  } catch { return null }
}
