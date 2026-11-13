// Storage + deletion helpers shared by delete-account and legal-hold.
// Every step is idempotent so a partial failure can simply be re-run.
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
export const HOLD_BUCKET = 'legal-holds'

const ORIGINS = new Set(['https://www.hole-eaters.com', 'https://hole-eaters.com', 'http://localhost:5173'])
export const corsFor = (origin: string | null) => ({
  'access-control-allow-origin': origin && (ORIGINS.has(origin) || origin.endsWith('.vercel.app')) ? origin : 'https://www.hole-eaters.com',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'origin',
})
export const logger = (fn: string) => (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn, event, ...data }))

export async function callerId(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data?.user?.id ?? null
}

/** Every object path under `prefix` (recursive). Storage list() is one folder deep, 1000 per page. */
export async function listAll(bucket: string, prefix: string): Promise<string[]> {
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

export async function removeAll(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw new Error(`remove ${bucket}: ${error.message}`)
  }
  return paths.length
}

/** Copies bucket/prefix into legal-holds/<held>/<bucket>/… Existing copies are kept (first capture wins). */
export async function preserveFolder(held: string, bucket: string, prefix: string): Promise<number> {
  let n = 0
  for (const path of await listAll(bucket, prefix)) {
    const { error } = await admin.storage.from(bucket).copy(path, `${held}/${bucket}/${path}`, { destinationBucket: HOLD_BUCKET })
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`copy ${bucket}/${path}: ${error.message}`)
    if (!error) n++
  }
  return n
}

export async function matchesOf(uid: string) {
  const { data, error } = await admin.from('matches').select('id,user_a,user_b').or(`user_a.eq.${uid},user_b.eq.${uid}`)
  if (error) throw new Error(`matches: ${error.message}`)
  return data ?? []
}

export async function heldAmong(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await admin.from('legal_holds').select('user_id').in('user_id', ids)
  if (error) throw new Error(`legal_holds: ${error.message}`)
  return new Set((data ?? []).map(r => r.user_id as string))
}

/** Full "delete everything now". Callers must have ruled out a legal hold on uid first. */
export async function eraseAccount(uid: string) {
  const matches = await matchesOf(uid)
  const partners = matches.map(m => (m.user_a === uid ? m.user_b : m.user_a))
  const heldPartners = await heldAmong(partners)

  const files = { media: 0, videos: 0, chat: 0, preserved: 0 }
  files.media = await removeAll('media', await listAll('media', uid))
  files.videos = await removeAll('videos', await listAll('videos', uid))
  for (const m of matches) {
    const partner = m.user_a === uid ? m.user_b : m.user_a
    // Chat rows are captured by the DB trigger; the files have to be copied here before they go.
    if (heldPartners.has(partner)) files.preserved += await preserveFolder(partner, 'chat', m.id)
    files.chat += await removeAll('chat', await listAll('chat', m.id))
  }

  // Public-room posts are only SET NULL by the cascade; "delete everything" means remove them.
  const { error: gErr } = await admin.from('global_messages').delete().eq('sender_id', uid)
  if (gErr) throw new Error(`global_messages: ${gErr.message}`)

  // Cascades to profile, likes, matches, messages, keys, reviews, blocks, views, push subs, bans, videos, check-ins…
  const { error: dErr } = await admin.auth.admin.deleteUser(uid)
  if (dErr) throw new Error(`deleteUser: ${dErr.message}`)
  return { files, matches: matches.length }
}
