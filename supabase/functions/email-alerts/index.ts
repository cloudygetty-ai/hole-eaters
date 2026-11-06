// Discreet "you have unread messages" emails (deployed as `email-alerts`, verify_jwt = false).
// Poked every 10 min by pg_cron (public.poke_email_alerts) with the shared x-notify-secret header.
// Who is due is decided in the database (public.email_alert_batch); this only sends.
// Needs the RESEND_API_KEY secret; optional EMAIL_FROM (default "Alerts <alerts@hole-eaters.com>").
// Without the key it exits before claiming anyone, so nobody's 6-hour window is used up.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
const FROM = Deno.env.get('EMAIL_FROM') ?? 'Alerts <alerts@hole-eaters.com>'
const APP_URL = 'https://www.hole-eaters.com/app'

const rest = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let secret: string | null = null
async function notifySecret(): Promise<string | null> {
  if (secret) return secret
  const res = await rest('rpc/push_config', { method: 'POST', body: '{}' })
  if (!res.ok) return null
  secret = (await res.json() as { secret: string }).secret
  return secret
}

// Deliberately bland: no app name in the subject, no sender names, no message text.
function render(unread: number, chats: number) {
  const what = unread === 1 ? 'a new message' : `${unread} new messages`
  const from = chats > 1 ? ` in ${chats} chats` : ''
  const text = `You have ${what}${from}.\n\nOpen the app to read: ${APP_URL}\n\nTo stop these emails, turn off “Email alerts” in Privacy settings.`
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:480px">
<p>You have ${what}${from}.</p>
<p><a href="${APP_URL}" style="display:inline-block;padding:10px 18px;background:#222;color:#fff;border-radius:8px;text-decoration:none">Open the app</a></p>
<p style="font-size:12px;color:#888">To stop these emails, turn off “Email alerts” in Privacy settings.</p></div>`
  return { subject: 'You have unread messages', text, html }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const s = await notifySecret()
  if (!s || req.headers.get('x-notify-secret') !== s) return json({ error: 'unauthorized' }, 401)
  if (!RESEND_KEY) return json({ skipped: 'RESEND_API_KEY not set' })

  const t0 = Date.now()
  const res = await rest('rpc/email_alert_batch', { method: 'POST', body: '{}' })
  if (!res.ok) { console.error('[email-alerts] batch', res.status, await res.text()); return json({ error: 'batch' }, 500) }
  const due = await res.json() as { user_id: string; email: string; unread: number; chats: number }[]

  let sent = 0, failed = 0
  for (const d of due) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [d.email], ...render(d.unread, d.chats), headers: { 'List-Unsubscribe': `<${APP_URL}>` } }),
    }).catch(e => { console.error('[email-alerts] send', String(e)); return null })
    if (r?.ok) sent++
    else { failed++; if (r) console.error('[email-alerts] resend', r.status, (await r.text()).slice(0, 200)) }
  }
  console.log('[email-alerts]', JSON.stringify({ due: due.length, sent, failed, ms: Date.now() - t0 }))
  return json({ due: due.length, sent, failed })
})
