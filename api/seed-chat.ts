/// <reference types="node" />

// Server-side Seed AI chat.
//
// The client can only say WHICH persona and WHAT the user typed. The server owns everything else:
// the system prompt, the phase rules, the model and the limits. Before this, the client posted its
// own `system` prompt, so anyone could use this endpoint as an open Claude proxy on our key and
// skip every injection filter.
//
// Request:  POST { seedId, state, tone, history: [{ role, content }], message }
//           Authorization: Bearer <Supabase access token>   (guests count; they're signed in anonymously)
// Response: { reply }

import { SEED_AI, SEED_STATES, buildSeedSystemPrompt, type SeedState, type SeedTone } from './_lib/seedPersonas.js'
import { sanitizeUserInput, fenceUserContent } from './_lib/sanitize.js'

export const config = { runtime: 'nodejs' }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xebwdvtaivqjwbwbzdpv.supabase.co'
// Public anon key (ships in every browser bundle by design); only used to validate user tokens
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYndkdnRhaXZxandid2J6ZHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTk2MTAsImV4cCI6MjA4NjUzNTYxMH0.7eTr-Pw-qqrLPfUSpjySZ9PSJ8zbN31XMRax6ChJnb8'

const MAX_HISTORY = 12
const MAX_ASSISTANT_LEN = 400
const OPEN_TRIGGER = '[open]'
const RATE = { windowMs: 60_000, perUser: 15 }
const TONES: SeedTone[] = ['short', 'neutral', 'long']

const DEFLECT = ['lmao no', "that's not how this works", 'nice try', 'say that again normally', 'what?']

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

// Best-effort per-instance limiter (serverless instances don't share memory; still caps bursts)
const hits = new Map<string, number[]>()
function allow(userId: string): boolean {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter(t => now - t < RATE.windowMs)
  if (recent.length >= RATE.perUser) { hits.set(userId, recent); return false }
  hits.set(userId, [...recent, now])
  if (hits.size > 5000) hits.clear()
  return true
}

async function userIdFrom(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token || token.length > 4096) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const user = await res.json() as { id?: string }
    return typeof user.id === 'string' ? user.id : null
  } catch { return null }
}

// Assistant turns come from the client too, so they're untrusted: same filter, shorter cap
function cleanHistory(raw: unknown): { role: 'user' | 'assistant'; content: string }[] | null {
  if (!Array.isArray(raw)) return null
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of raw.slice(-MAX_HISTORY)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null
    if (m.role === 'assistant' && m.content.length > MAX_ASSISTANT_LEN) return null
    const { clean, blocked } = sanitizeUserInput(m.content)
    if (blocked) return null
    out.push({ role: m.role, content: m.role === 'user' ? fenceUserContent(clean) : clean })
  }
  // The API requires alternating turns starting with the user
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 32_000) return json({ error: 'payload_too_large' }, 413)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'server_misconfigured' }, 500)

  const userId = await userIdFrom(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)
  if (!allow(userId)) return json({ reply: 'hold on a sec' }, 429)

  let body: { seedId?: unknown; state?: unknown; tone?: unknown; history?: unknown; message?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const ai = typeof body.seedId === 'string' && Object.hasOwn(SEED_AI, body.seedId) ? SEED_AI[body.seedId] : null
  const state = SEED_STATES.includes(body.state as SeedState) ? body.state as SeedState : null
  const tone = TONES.includes(body.tone as SeedTone) ? body.tone as SeedTone : 'neutral'
  if (!ai || !state || typeof body.message !== 'string') return json({ error: 'invalid_payload' }, 400)

  const isOpen = body.message === OPEN_TRIGGER && state === 'GREETING'
  let userTurn: string
  if (isOpen) {
    userTurn = OPEN_TRIGGER
  } else {
    const { clean, blocked } = sanitizeUserInput(body.message)
    if (blocked) return json({ reply: DEFLECT[Math.floor(Math.random() * DEFLECT.length)] })
    userTurn = fenceUserContent(clean)
  }

  const history = cleanHistory(body.history ?? [])
  if (!history) return json({ reply: DEFLECT[Math.floor(Math.random() * DEFLECT.length)] })
  const messages = [...history, { role: 'user' as const, content: userTurn }]
  // Merge back-to-back user turns so the conversation stays valid
  const merged = messages.reduce<typeof messages>((acc, m) => {
    const last = acc[acc.length - 1]
    if (last && last.role === m.role) last.content += '\n' + m.content
    else acc.push({ ...m })
    return acc
  }, [])

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        system: buildSeedSystemPrompt(ai, state, tone),
        messages: merged,
      }),
    })
    if (!res.ok) return json({ error: 'upstream_error' }, 502)
    const data = await res.json() as { content?: { text?: string }[] }
    const reply = (data?.content?.[0]?.text ?? '').replace(/\[USER MESSAGE[^\]]*\]/g, '').trim()
    return json({ reply: reply.slice(0, 600) || '...' })
  } catch {
    return json({ error: 'proxy_failed' }, 502)
  }
}
