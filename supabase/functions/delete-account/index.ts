// Permanent account deletion ("delete everything now").
// Deployed with verify_jwt = true; the caller can only ever delete themselves.
// Under a legal hold the account is closed instead (login blocked, hidden, data kept) and the
// response is identical, so a held member is never tipped off. See privacy.html.
import { admin, callerId, corsFor, eraseAccount, heldAmong, logger } from '../_shared/accountData.ts'

const log = logger('delete-account')

async function closeHeldAccount(uid: string, token: string) {
  const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (profile) await admin.from('legal_hold_evidence').insert({ held_user: uid, kind: 'profile', source_id: uid, data: profile })
  await admin.from('profiles').update({ ghost: true, online: false }).eq('id', uid)
  await admin.from('bans').upsert({ user_id: uid, reason: 'Account closed', banned_by: uid }, { onConflict: 'user_id' })
  const { error } = await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' })
  if (error) throw new Error(`ban: ${error.message}`)
  await admin.auth.admin.signOut(token, 'global')
  const { error: hErr } = await admin.from('legal_holds').update({ closed_at: new Date().toISOString() }).eq('user_id', uid).is('closed_at', null)
  if (hErr) throw new Error(`legal_holds: ${hErr.message}`)
}

async function deleteAccount(uid: string, token: string): Promise<[number, unknown]> {
  const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle()
  if (isAdmin) return [409, { error: 'admin_account' }] // admins are removed by hand so the site never loses its last one

  if ((await heldAmong([uid])).has(uid)) {
    await closeHeldAccount(uid, token)
    log('closed') // no user id or hold detail in logs
    return [200, { ok: true }]
  }

  const result = await eraseAccount(uid)
  log('deleted', result) // no user id in logs once the account is gone
  return [200, { ok: true }]
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405, headers: cors })

  const uid = await callerId(req)
  if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors })

  const body = await req.json().catch(() => ({})) as { confirm?: string }
  if (body.confirm !== 'DELETE') return Response.json({ error: 'confirm_required' }, { status: 400, headers: cors })

  try {
    const token = req.headers.get('authorization')!.replace(/^Bearer /, '')
    const [status, out] = await deleteAccount(uid, token)
    return Response.json(out, { status, headers: cors })
  } catch (e) {
    log('failed', { error: String(e) })
    return Response.json({ error: 'delete_failed' }, { status: 500, headers: cors })
  }
})
