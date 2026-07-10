/// <reference types="node" />

// Server-side proxy for Seed AI chat.
//
// PREVIOUSLY: the client called api.anthropic.com directly with
// VITE_ANTHROPIC_API_KEY, which Vite bakes into the public JS bundle —
// anyone opening devtools could extract the key and use it on their own bill.
//
// NOW: the client posts { system, messages } to this endpoint. The key
// lives only in the server env var ANTHROPIC_API_KEY (no VITE_ prefix,
// never bundled). Set it in Vercel → Project → Settings → Environment
// Variables. This function also caps request size and message count so
// a single client can't blow up token spend in one call.

export const config = { runtime: 'nodejs' }

const MAX_MESSAGES = 40
const MAX_SYSTEM_LEN = 4000
const MAX_MSG_LEN = 2000

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 })
  }

  let body: { system?: string; messages?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 })
  }

  const { system, messages } = body
  if (typeof system !== 'string' || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400 })
  }
  if (system.length > MAX_SYSTEM_LEN || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 400 })
  }
  for (const m of messages) {
    if (
      (m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string' ||
      m.content.length > MAX_MSG_LEN
    ) {
      return new Response(JSON.stringify({ error: 'invalid_message' }), { status: 400 })
    }
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        system,
        messages,
      }),
    })

    if (!anthropicRes.ok) {
      return new Response(JSON.stringify({ error: 'upstream_error' }), { status: 502 })
    }

    const data = await anthropicRes.json()
    const reply = data?.content?.[0]?.text?.trim() ?? '...'
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'proxy_failed' }), { status: 502 })
  }
}
