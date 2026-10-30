// In-memory stand-in for Supabase (auth, PostgREST, RPC, storage) so end-to-end tests drive the REAL
// app in a real browser without touching production. One FakeBackend is shared by every browser
// context in a test, so several people can use the app at once (e.g. two people chatting).
//
// It mimics the wire format supabase-js expects. It does NOT enforce RLS: database security is
// tested separately against Postgres (supabase/tests/security.sql).

import type { BrowserContext, Route, Request } from '@playwright/test'
import { randomUUID } from 'node:crypto'

export const SUPABASE_HOST = 'xebwdvtaivqjwbwbzdpv.supabase.co'
export const AUTH_STORAGE_KEY = 'sb-xebwdvtaivqjwbwbzdpv-auth-token'

type Row = Record<string, any>
export interface FakeUser { id: string; email?: string | null }

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
export function fakeJwt(sub: string) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400, is_anonymous: true })}.sig`
}
export function sessionFor(user: FakeUser) {
  return {
    access_token: fakeJwt(user.id), refresh_token: `refresh-${user.id}`, token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email ?? null, is_anonymous: !user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
}

// alias:profiles!<table>_<column>_fkey(...)  →  embed the profile referenced by <column>
const EMBED = /(\w+):profiles!(\w+?)_fkey\(([^)]*)\)/g

export class FakeBackend {
  tables: Record<string, Row[]> = {}
  files = new Map<string, { bytes: Buffer; type: string }>() // "bucket/path"
  rpcCalls: { name: string; args: any; user: string | null }[] = []
  rpc: Record<string, (args: any, user: string | null) => unknown> = {}

  constructor() {
    this.rpc = {
      nearby_users: (_a, user) => this.t('profiles').filter(p => p.id !== user && p.name && !p.ghost)
        .map(p => ({ ...p, location: p.location ?? { lat: 40.749, lng: -73.985 }, distance_meters: 300 })),
      update_user_location: (a) => { const p = this.t('profiles').find(x => x.id === a.user_id); if (p) p.location = { lat: a.lat, lng: a.lng }; return null },
      is_admin: () => false,
      my_invite_stats: () => null,
      claim_referral: () => false,
      get_review_summary: (a, user) => {
        const rs = this.t('reviews').filter(r => r.reviewee_id === a.target && !r.hidden)
        const met = rs.filter(r => r.met !== 'chat_only')
        return { review_count: rs.length, avg_rating: rs.length ? rs.reduce((s, r) => s + (r.rating ?? 0), 0) / Math.max(1, rs.filter(r => r.rating).length) : null,
          meetups: met.length, showed: met.filter(r => r.met === 'showed').length, late: met.filter(r => r.met === 'late').length,
          flaked: met.filter(r => r.met === 'flaked').length, flake_rate: met.length ? met.filter(r => r.met === 'flaked').length / met.length : null,
          can_review: !!user && user !== a.target && this.chatted(user, a.target) }
      },
      get_reviews: (a, user) => this.t('reviews').filter(r => r.reviewee_id === a.target && !r.hidden)
        .map(r => ({ id: r.id, met: r.met, rating: r.rating, tags: r.tags ?? [], body: r.body, created_at: r.created_at, is_mine: r.reviewer_id === user })),
      flag_review: () => null,
      my_private: (_a, user) => { const p = this.t('profiles').find(x => x.id === user); return p ? { age: p.age, privacy: p.privacy ?? {}, tz: p.tz ?? null } : null },
      chat_prefs: (a) => ({ video: !this.t('profiles').find(x => x.id === a.other)?.privacy?.video_off }),
      get_responsiveness: (a) => this.t('profiles').find(x => x.id === a.target)?.privacy?.hide_response_insight ? null : (this.t('profiles').find(x => x.id === a.target)?.reply_rate ?? null),
      my_insights: (a, user) => {
        const ids = new Set<string>([
          ...this.t('profile_views').filter(v => v.viewed_id === user).map(v => v.viewer_id),
          ...this.t('likes').filter(l => l.to_user === user).map(l => l.from_user),
        ])
        const people = this.t('profiles').filter(p => ids.has(p.id))
        const count = (f: (p: Row) => string | null | undefined, skip: (p: Row) => boolean) =>
          people.filter(p => !skip(p) && f(p)).reduce((o: Record<string, number>, p) => { const k = f(p)!; o[k] = (o[k] ?? 0) + 1; return o }, {})
        const band = (age: number) => age < 26 ? '18-25' : age < 36 ? '26-35' : age < 46 ? '36-45' : age < 56 ? '46-55' : '56+'
        return {
          days: a.days ?? 30, views: this.t('profile_views').filter(v => v.viewed_id === user).length,
          likes: this.t('likes').filter(l => l.to_user === user).length, messages: 0, people: ids.size,
          by_role: count(p => p.role, p => !!p.privacy?.hide_from_community_insights),
          by_body: count(p => p.details?.body, p => !!p.privacy?.hide_from_community_insights),
          by_age: count(p => p.age ? band(p.age) : null, p => !!p.privacy?.hide_from_age_insights || !!p.privacy?.hide_age),
          responsiveness: this.t('profiles').find(x => x.id === user)?.reply_rate ?? null,
        }
      },
      post_global_message: (a, user) => [this.insert('global_messages', { sender_id: a.p_ghost ? null : user, content: (a.p_ghost ? '👻 ' : '') + a.p_content })],
    }
  }

  t(name: string) { return (this.tables[name] ??= []) }
  insert(table: string, row: Row) {
    const r = { id: randomUUID(), created_at: new Date().toISOString(), ...row }
    if (table === 'user_keys') { r.device_id ??= randomUUID(); delete r.id }
    this.t(table).push(r); return r
  }
  chatted(a: string, b: string) {
    const m = this.t('matches').find(x => (x.user_a === a && x.user_b === b) || (x.user_a === b && x.user_b === a))
    if (!m) return false
    const ms = this.t('messages').filter(x => x.match_id === m.id)
    return ms.some(x => x.sender_id === a) && ms.some(x => x.sender_id === b)
  }

  addProfile(p: Row) { const row = { color: '#ff4d6d', emoji: '🔥', role: 'Versatile', age: 30, bio: '', tags: [], details: {}, online: true, is_anon: false, ghost: false, notify_previews: false, ...p }; this.t('profiles').push(row); return row }

  /** Wire this backend into a browser context, signed in as `user` (or signed out). */
  // signedIn: false → the browser starts signed out; `user` is who it becomes on guest sign-up.
  async attach(context: BrowserContext, user: FakeUser | null, opts: { csp?: string; signedIn?: boolean } = {}) {
    const signedIn = opts.signedIn ?? true
    let current: FakeUser | null = signedIn ? user : null
    await context.addInitScript(([key, session]) => {
      try {
        localStorage.setItem('he_install_snooze_until', String(Date.now() + 864e5))
        if (session && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session))
      } catch { /* noop */ }
    }, [AUTH_STORAGE_KEY, signedIn && user ? sessionFor(user) : null] as const)

    await context.route(url => url.hostname === SUPABASE_HOST, async (route, req) => {
      const url = new URL(req.url())
      try {
        if (url.pathname.startsWith('/realtime/')) return route.abort()
        if (url.pathname.startsWith('/auth/v1/')) return this.auth(route, req, url, () => current ?? (url.pathname.endsWith('/signup') ? user : null), u => { current = u })
        if (url.pathname.startsWith('/storage/v1/')) return this.storage(route, req, url)
        if (url.pathname.startsWith('/rest/v1/rpc/')) return this.callRpc(route, req, url, current?.id ?? null)
        if (url.pathname.startsWith('/rest/v1/')) return this.rest(route, req, url)
        if (url.pathname.startsWith('/functions/v1/')) return route.fulfill({ status: 200, json: {} })
        return route.fulfill({ status: 404, json: {} })
      } catch (e) {
        return route.fulfill({ status: 500, json: { message: String(e) } })
      }
    })

    if (opts.csp) {
      // Vite preview doesn't send vercel.json headers; add the production CSP to HTML documents
      await context.route(url => url.pathname === '/' || url.pathname === '/app' || url.pathname.endsWith('.html'), async route => {
        const res = await route.fetch()
        await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': opts.csp! } })
      })
    }
  }

  // ── auth ──
  private auth(route: Route, req: Request, url: URL, get: () => FakeUser | null, set: (u: FakeUser) => void) {
    const p = url.pathname
    if (p.endsWith('/signup') || (p.endsWith('/token') && url.searchParams.get('grant_type') !== 'refresh_token')) {
      const u = get() ?? { id: randomUUID() }; set(u)
      return route.fulfill({ status: 200, json: sessionFor(u) })
    }
    if (p.endsWith('/token')) { const u = get(); return u ? route.fulfill({ status: 200, json: sessionFor(u) }) : route.fulfill({ status: 401, json: {} }) }
    if (p.endsWith('/user')) { const u = get(); return u ? route.fulfill({ status: 200, json: sessionFor(u).user }) : route.fulfill({ status: 401, json: {} }) }
    if (p.endsWith('/otp') || p.endsWith('/recover')) return route.fulfill({ status: 200, json: {} })
    if (p.endsWith('/logout')) return route.fulfill({ status: 204, body: '' })
    return route.fulfill({ status: 200, json: {} })
  }

  // ── rpc ──
  private async callRpc(route: Route, req: Request, url: URL, user: string | null) {
    const name = url.pathname.split('/').pop()!
    const args = req.postDataJSON?.() ?? {}
    this.rpcCalls.push({ name, args, user })
    const fn = this.rpc[name]
    const out = fn ? fn(args, user) : null
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    return route.fulfill({ status: 200, json: single && Array.isArray(out) ? out[0] ?? null : out })
  }

  // ── PostgREST ──
  private filterRows(rows: Row[], url: URL) {
    const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
    let out = rows
    for (const [k, v] of url.searchParams) {
      if (reserved.has(k)) continue
      if (k === 'or') {
        const parts = v.replace(/^\(|\)$/g, '').split(',').map(s => s.split('.'))
        out = out.filter(r => parts.some(([c, op, ...val]) => test(r[c], op, val.join('.'))))
      } else {
        const [op, ...rest] = v.split('.')
        out = out.filter(r => test(r[k], op, rest.join('.')))
      }
    }
    const order = url.searchParams.get('order')
    if (order) {
      const [col, dir] = order.split(',')[0].split('.')
      out = [...out].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1))
    }
    const limit = Number(url.searchParams.get('limit') ?? 0)
    return limit ? out.slice(0, limit) : out
  }

  private shape(table: string, rows: Row[], select: string | null) {
    if (!select || !select.includes('profiles!')) return rows
    const embeds = [...select.matchAll(EMBED)].map(m => ({ alias: m[1], col: m[2].replace(`${table}_`, '') }))
    return rows.map(r => {
      const o = { ...r }
      for (const e of embeds) o[e.alias] = this.t('profiles').find(p => p.id === r[e.col]) ?? null
      return o
    })
  }

  private reply(route: Route, req: Request, rows: Row[], status = 200) {
    const accept = req.headers()['accept'] ?? ''
    if (accept.includes('vnd.pgrst.object')) {
      if (rows.length !== 1) return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${rows.length} rows` } })
      return route.fulfill({ status, json: rows[0] })
    }
    return route.fulfill({ status, json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } })
  }

  private async rest(route: Route, req: Request, url: URL) {
    const table = url.pathname.split('/').pop()!
    const rows = this.t(table)
    const method = req.method()
    const prefer = req.headers()['prefer'] ?? ''
    if (method === 'GET' || method === 'HEAD') {
      const matched = this.filterRows(rows, url)
      if (method === 'HEAD' || prefer.includes('count=exact') && url.searchParams.get('select')?.startsWith('id')) {
        return route.fulfill({ status: 200, body: method === 'HEAD' ? '' : JSON.stringify(matched), headers: { 'content-range': `*/${matched.length}` } })
      }
      return this.reply(route, req, this.shape(table, matched, url.searchParams.get('select')))
    }
    if (method === 'POST') {
      const body = req.postDataJSON()
      const list: Row[] = Array.isArray(body) ? body : [body]
      const conflict = url.searchParams.get('on_conflict')?.split(',')
      const out: Row[] = []
      for (const item of list) {
        const existing = conflict ? rows.find(r => conflict.every(c => r[c] === item[c])) : undefined
        if (existing && prefer.includes('ignore-duplicates')) continue
        if (existing) { Object.assign(existing, item); out.push(existing) } else out.push(this.insert(table, item))
      }
      return this.reply(route, req, this.shape(table, out, url.searchParams.get('select')), 201)
    }
    if (method === 'PATCH') {
      const patch = req.postDataJSON()
      const matched = this.filterRows(rows, url)
      matched.forEach(r => Object.assign(r, patch))
      return this.reply(route, req, matched)
    }
    if (method === 'DELETE') {
      const matched = new Set(this.filterRows(rows, url))
      this.tables[table] = rows.filter(r => !matched.has(r))
      return this.reply(route, req, [...matched])
    }
    return route.fulfill({ status: 405, json: {} })
  }

  // ── storage ──
  private async storage(route: Route, req: Request, url: URL) {
    const p = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''))
    const method = req.method()
    if (method === 'POST' && p.startsWith('sign/')) {
      const bucket = p.slice(5).split('/')[0]
      const body = req.postDataJSON()
      if (body.paths) return route.fulfill({ status: 200, json: body.paths.map((path: string) => ({ path, signedURL: `/object/sign/${bucket}/${path}?token=t`, error: null })) })
      return route.fulfill({ status: 200, json: { signedURL: `/object/sign/${p.slice(5)}?token=t` } })
    }
    if ((method === 'POST' || method === 'PUT') && !p.startsWith('sign/')) {
      const { bytes, type } = parseUpload(req)
      this.files.set(p, { bytes, type })
      return route.fulfill({ status: 200, json: { Key: p, Id: randomUUID(), path: p.split('/').slice(1).join('/') } })
    }
    if (method === 'GET') {
      const key = p.replace(/^(authenticated|public|sign)\//, '')
      const f = this.files.get(key)
      return f ? route.fulfill({ status: 200, body: f.bytes, contentType: f.type }) : route.fulfill({ status: 404, json: { message: 'not found' } })
    }
    return route.fulfill({ status: 405, json: {} })
  }
}

function test(value: any, op: string, raw: string): boolean {
  const v = raw
  switch (op) {
    case 'eq': return String(value) === v
    case 'neq': return String(value) !== v
    case 'is': return v === 'null' ? value == null : String(value) === v
    case 'in': return v.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(value))
    case 'gt': return String(value) > v
    case 'gte': return String(value) >= v
    case 'lt': return String(value) < v
    case 'lte': return String(value) <= v
    case 'not': return !test(value, raw.split('.')[0], raw.split('.').slice(1).join('.'))
    default: return true
  }
}

// supabase-js sends Blob uploads as multipart/form-data; pull out the file part
function parseUpload(req: Request): { bytes: Buffer; type: string } {
  const buf = req.postDataBuffer() ?? Buffer.alloc(0)
  const ct = req.headers()['content-type'] ?? ''
  const m = /boundary=(.+)$/.exec(ct)
  if (!m) return { bytes: buf, type: ct || 'application/octet-stream' }
  const boundary = Buffer.from(`--${m[1]}`)
  let start = 0
  while (true) {
    const i = buf.indexOf(boundary, start); if (i < 0) break
    const next = buf.indexOf(boundary, i + boundary.length); if (next < 0) break
    const part = buf.subarray(i + boundary.length + 2, next - 2)
    const sep = part.indexOf('\r\n\r\n')
    const head = part.subarray(0, sep).toString()
    if (/filename=|name=""/.test(head)) {
      const type = /Content-Type: ([^\r\n]+)/i.exec(head)?.[1] ?? 'application/octet-stream'
      return { bytes: Buffer.from(part.subarray(sep + 4)), type }
    }
    start = next
  }
  return { bytes: buf, type: 'application/octet-stream' }
}
