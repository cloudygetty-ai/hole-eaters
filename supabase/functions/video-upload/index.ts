// Video posts pipeline: init (signed upload URL) → finalize (to review queue) → consent / moderate.
// Deployed with verify_jwt = true; the caller's JWT is re-resolved here to get the user id.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_BYTES = 500 * 1024 ** 2
const DAILY_LIMIT = 5
const MAX_PERFORMERS = 6
const MIME_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }
const ORIGINS = new Set(['https://www.hole-eaters.com', 'https://hole-eaters.com', 'http://localhost:5173'])

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type Body = Record<string, unknown>
const corsFor = (origin: string | null) => ({
  'access-control-allow-origin': origin && (ORIGINS.has(origin) || origin.endsWith('.vercel.app')) ? origin : 'https://www.hole-eaters.com',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'origin',
})
const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: 'video-upload', event, ...data }))

const cleanTags = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? [...new Set(raw.map((t) => String(t).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)).filter(Boolean))].slice(0, 10)
    : []

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

async function init(uid: string, b: Body): Promise<[number, unknown]> {
  const { data: ver } = await admin.from('creator_verifications').select('status').eq('user_id', uid).maybeSingle()
  if (ver?.status !== 'verified') return [403, { error: 'verification_required' }]

  const ext = MIME_EXT[String(b.mime)]
  const size = Number(b.size)
  if (!ext) return [415, { error: 'unsupported_type' }]
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return [413, { error: 'too_large' }]
  if (b.attest !== true) return [400, { error: 'attestation_required' }]

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await admin.from('videos').select('id', { count: 'exact', head: true }).eq('uploader_id', uid).gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT) return [429, { error: 'daily_limit' }]

  const performers = [...new Set(Array.isArray(b.performerIds) ? b.performerIds.filter(isUuid) : [])]
    .filter((id) => id !== uid).slice(0, MAX_PERFORMERS)
  if (performers.length) {
    const { data: ok } = await admin.from('creator_verifications').select('user_id').in('user_id', performers).eq('status', 'verified')
    if ((ok?.length ?? 0) !== performers.length) return [422, { error: 'performer_not_verified' }]
  }

  const id = crypto.randomUUID()
  const path = `${uid}/${id}.${ext}`
  const { error: vErr } = await admin.from('videos').insert({
    id, uploader_id: uid, storage_path: path, size_bytes: size,
    caption: typeof b.caption === 'string' ? b.caption.slice(0, 500) : null,
    tags: cleanTags(b.tags), attested_at: new Date().toISOString(),
  })
  if (vErr) throw vErr

  const now = new Date().toISOString()
  const { error: pErr } = await admin.from('video_performers').insert([
    { video_id: id, performer_id: uid, consent: 'granted', responded_at: now },
    ...performers.map((p) => ({ video_id: id, performer_id: p })),
  ])
  if (pErr) throw pErr

  const { data: signed, error: sErr } = await admin.storage.from('videos').createSignedUploadUrl(path)
  if (sErr) throw sErr
  log('init', { uid, id, performers: performers.length, size })
  return [200, { videoId: id, path, token: signed.token }]
}

async function finalize(uid: string, b: Body): Promise<[number, unknown]> {
  if (!isUuid(b.videoId)) return [400, { error: 'bad_id' }]
  const { data: v } = await admin.from('videos').select('id, storage_path, status').eq('id', b.videoId).eq('uploader_id', uid).maybeSingle()
  if (!v) return [404, { error: 'not_found' }]
  if (v.status !== 'uploading') return [409, { error: 'already_finalized' }]

  const fileName = v.storage_path.split('/')[1]
  const { data: objs } = await admin.storage.from('videos').list(uid, { search: fileName })
  if (!objs?.some((o) => o.name === fileName)) return [409, { error: 'upload_missing' }]

  await admin.from('videos').update({ status: 'pending_review' }).eq('id', v.id)

  // Hash-matching / classifier service (e.g. Thorn Safer). Unset → human review is the only gate.
  const hook = Deno.env.get('SCAN_WEBHOOK_URL')
  if (hook) {
    fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoId: v.id, path: v.storage_path }) })
      .catch((e) => log('scan_dispatch_failed', { id: v.id, msg: String(e) }))
  }
  // TODO[P1] push tagged performers via public.queue_push so they can approve.
  log('finalize', { uid, id: v.id })
  return [200, { status: 'pending_review' }]
}

async function consent(uid: string, b: Body): Promise<[number, unknown]> {
  if (!isUuid(b.videoId) || !['granted', 'revoked'].includes(String(b.decision))) return [400, { error: 'bad_request' }]
  const { data, error } = await admin.from('video_performers')
    .update({ consent: b.decision, responded_at: new Date().toISOString() })
    .eq('video_id', b.videoId).eq('performer_id', uid).select('video_id')
  if (error) throw error
  if (!data?.length) return [404, { error: 'not_tagged' }]
  log('consent', { uid, id: b.videoId, decision: b.decision })
  return [200, { ok: true }]
}

async function moderate(uid: string, b: Body): Promise<[number, unknown]> {
  const { data: adm } = await admin.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle()
  if (!adm) return [403, { error: 'forbidden' }]
  const next = ({ approve: 'approved', reject: 'rejected', remove: 'removed' } as Record<string, string>)[String(b.decision)]
  if (!next || !isUuid(b.videoId)) return [400, { error: 'bad_request' }]
  const { error } = await admin.from('videos').update({
    status: next,
    approved_at: next === 'approved' ? new Date().toISOString() : null,
    reject_reason: next === 'approved' ? null : String(b.reason ?? '').slice(0, 300),
  }).eq('id', b.videoId)
  if (error) throw error
  await admin.from('video_reports').update({ resolved_at: new Date().toISOString() }).eq('video_id', b.videoId).is('resolved_at', null)
  await admin.from('admin_log').insert({ admin_id: uid, action: `video_${b.decision}`, target_type: 'video', target_id: b.videoId, metadata: { reason: b.reason ?? null } })
  log('moderate', { mod: uid, id: b.videoId, next })
  return [200, { status: next }]
}

const HANDLERS: Record<string, (uid: string, b: Body) => Promise<[number, unknown]>> = { init, finalize, consent, moderate }

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'))
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const t0 = performance.now()
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const { data: { user } } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } }
  if (!user) return reply(401, { error: 'unauthorized' })

  let body: Body
  try { body = await req.json() } catch { return reply(400, { error: 'bad_json' }) }
  const handler = HANDLERS[String(body.action)]
  if (!handler) return reply(400, { error: 'unknown_action' })

  try {
    const [status, out] = await handler(user.id, body)
    log('request', { action: body.action, status, ms: Math.round(performance.now() - t0) })
    return reply(status, out)
  } catch (e) {
    log('error', { action: body.action, msg: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - t0) })
    return reply(500, { error: 'internal' })
  }
})
