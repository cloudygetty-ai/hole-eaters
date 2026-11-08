// Permanent account deletion ("delete everything now").
// Deployed with verify_jwt = true; the caller can only ever delete themselves.
// Order matters: files first (they're keyed by ids that disappear with the rows), then rows via the
// auth.users cascade. Re-running after a partial failure is safe — every step is idempotent.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ORIGINS = new Set(['https://www.hole-eaters.com', 'https://hole-eaters.com', 'http://localhost:5173'])
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const corsFor = (origin: string | null) => ({
  'access-control-allow-origin': origin && (ORIGINS.has(origin) || origin.endsWith('.vercel.app')) ? origin : 'https://www.hole-eaters.com',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'origin',
})
const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: 'delete-account', event, ...data }))

/** Every object path under `prefix` (recursive). Storage list() is one folder deep, 1000 per page. */
async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`
      if (item.id === null) out.push(...await listAll(bucket, path)) // folder
      else out.push(path)
    }
    if (!data || data.length < 1000) return out
  }
}

async function removeAll(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw new Error(`remove ${bucket}: ${error.message}`)
  }
  return paths.length
}

async function deleteAccount(uid: string): Promise<[number, unknown]> {
  const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle()
  if (isAdmin) return [409, { error: 'admin_account' }] // admins are removed by hand so the site never loses its last one

  // Conversations die with the account, so both sides' chat files go too.
  const { data: matches, error: mErr } = await admin.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`)
  if (mErr) throw new Error(`matches: ${mErr.message}`)

  const files = {
    media: await removeAll('media', await listAll('media', uid)),
    videos: await removeAll('videos', await listAll('videos', uid)),
    chat: 0,
  }
  for (const m of matches ?? []) files.chat += await removeAll('chat', await listAll('chat', m.id))

  // Public-room posts are only SET NULL by the cascade; "delete everything" means remove them.
  const { error: gErr } = await admin.from('global_messages').delete().eq('sender_id', uid)
  if (gErr) throw new Error(`global_messages: ${gErr.message}`)

  // Cascades to profile, likes, matches, messages, keys, reviews, blocks, views, push subs, bans, videos, check-ins…
  const { error: dErr } = await admin.auth.admin.deleteUser(uid)
  if (dErr) throw new Error(`deleteUser: ${dErr.message}`)

  log('deleted', { files, matches: matches?.length ?? 0 }) // no user id in logs once the account is gone
  return [200, { ok: true }]
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405, headers: cors })

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: null }
  const uid = auth?.user?.id
  if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors })

  const body = await req.json().catch(() => ({})) as { confirm?: string }
  if (body.confirm !== 'DELETE') return Response.json({ error: 'confirm_required' }, { status: 400, headers: cors })

  try {
    const [status, out] = await deleteAccount(uid)
    return Response.json(out, { status, headers: cors })
  } catch (e) {
    log('failed', { error: String(e) })
    return Response.json({ error: 'delete_failed' }, { status: 500, headers: cors })
  }
})
