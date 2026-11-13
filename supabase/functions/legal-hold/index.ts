// Admin-only legal holds: list, place (snapshot everything now), release (drop evidence and, if the
// member already closed their account, finish the deletion they asked for).
// Deployed with verify_jwt = true; the caller must be in admin_users.
import { HOLD_BUCKET, admin, callerId, corsFor, eraseAccount, listAll, matchesOf, logger, preserveFolder, removeAll } from '../_shared/accountData.ts'

const log = logger('legal-hold')
const REASONS = new Set(['legal_process', 'litigation', 'ncmec_report'])
type Body = { action?: 'list' | 'place' | 'release'; user_id?: string; reason?: string; reference?: string; note?: string }

const audit = (adminId: string, action: string, target: string, metadata: Record<string, unknown>) =>
  admin.from('admin_log').insert({ admin_id: adminId, action, target_type: 'profile', target_id: target, metadata })

async function list() {
  const { data: holds, error } = await admin.from('legal_holds').select('user_id,reason,reference,note,placed_at,closed_at').order('placed_at', { ascending: false })
  if (error) throw new Error(`list: ${error.message}`)
  const ids = (holds ?? []).map(h => h.user_id)
  const { data: profiles } = ids.length ? await admin.from('profiles').select('id,name,emoji,color').in('id', ids) : { data: [] }
  const { data: ev } = ids.length ? await admin.from('legal_hold_evidence').select('held_user').in('held_user', ids) : { data: [] }
  return (holds ?? []).map(h => ({
    ...h,
    profile: profiles?.find(p => p.id === h.user_id) ?? null,
    evidence_rows: (ev ?? []).filter(e => e.held_user === h.user_id).length,
  }))
}

async function place(adminId: string, b: Body) {
  const uid = b.user_id!
  if (!REASONS.has(b.reason ?? '')) return [400, { error: 'reason' }] as const
  const { data: existing } = await admin.from('legal_holds').select('user_id').eq('user_id', uid).maybeSingle()

  if (!existing) {
    const { error } = await admin.from('legal_holds').insert({ user_id: uid, reason: b.reason, reference: b.reference || null, note: b.note || null, placed_by: adminId })
    if (error) throw new Error(`insert: ${error.message}`)
    // Rows: snapshot once, at placement. Later deletions are captured by the DB triggers.
    const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle()
    const matches = await matchesOf(uid)
    const rows: { held_user: string; kind: string; source_id: string; data: unknown }[] = []
    if (profile) rows.push({ held_user: uid, kind: 'profile', source_id: uid, data: profile })
    for (const m of matches) {
      rows.push({ held_user: uid, kind: 'match', source_id: m.id, data: m })
      const { data: msgs, error: mErr } = await admin.from('messages').select('*').eq('match_id', m.id)
      if (mErr) throw new Error(`messages: ${mErr.message}`)
      for (const x of msgs ?? []) rows.push({ held_user: uid, kind: 'message', source_id: x.id, data: x })
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error: eErr } = await admin.from('legal_hold_evidence').insert(rows.slice(i, i + 500))
      if (eErr) throw new Error(`evidence: ${eErr.message}`)
    }
    await audit(adminId, 'legal_hold_place', uid, { reason: b.reason, reference: b.reference ?? null })
  }

  // Files: re-running "place" on an existing hold re-copies anything missing (e.g. after a timeout).
  let files = await preserveFolder(uid, 'media', uid) + await preserveFolder(uid, 'videos', uid)
  for (const m of await matchesOf(uid)) files += await preserveFolder(uid, 'chat', m.id)
  log('placed', { files, resumed: !!existing })
  return [200, { ok: true, files }] as const
}

async function release(adminId: string, uid: string) {
  const { data: hold } = await admin.from('legal_holds').select('closed_at').eq('user_id', uid).maybeSingle()
  if (!hold) return [404, { error: 'not_held' }] as const
  await removeAll(HOLD_BUCKET, await listAll(HOLD_BUCKET, uid))
  const { error } = await admin.from('legal_holds').delete().eq('user_id', uid) // evidence rows cascade
  if (error) throw new Error(`delete hold: ${error.message}`)
  await audit(adminId, 'legal_hold_release', uid, { finished_deletion: !!hold.closed_at })
  // The member asked to be deleted while held; honour it now.
  if (hold.closed_at) await eraseAccount(uid)
  log('released', { finished_deletion: !!hold.closed_at })
  return [200, { ok: true, deleted: !!hold.closed_at }] as const
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405, headers: cors })

  const adminId = await callerId(req)
  const { data: isAdmin } = adminId ? await admin.from('admin_users').select('user_id').eq('user_id', adminId).maybeSingle() : { data: null }
  if (!adminId || !isAdmin) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors })

  const b = await req.json().catch(() => ({})) as Body
  const uuid = /^[0-9a-f-]{36}$/i
  try {
    if (b.action === 'list') return Response.json({ holds: await list() }, { headers: cors })
    if (!b.user_id || !uuid.test(b.user_id)) return Response.json({ error: 'user_id' }, { status: 400, headers: cors })
    const [status, out] = b.action === 'place' ? await place(adminId, b)
      : b.action === 'release' ? await release(adminId, b.user_id)
      : [400, { error: 'action' }] as const
    return Response.json(out, { status, headers: cors })
  } catch (e) {
    log('failed', { action: b.action, error: String(e) })
    return Response.json({ error: 'hold_failed' }, { status: 500, headers: cors })
  }
})
