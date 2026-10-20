// Sends Web Push notifications for Hole Eaters (deployed as the `notify` edge function, verify_jwt = false).
// Called only by database triggers (public.queue_push) with the shared x-notify-secret header,
// so JWT verification is off and the secret is checked here instead.
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const rest = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

type Config = { private: string; public: string; secret: string }
let config: Config | null = null
async function getConfig(): Promise<Config> {
  if (config) return config
  const res = await rest('rpc/push_config', { method: 'POST', body: '{}' })
  if (!res.ok) throw new Error(`push_config ${res.status}`)
  config = await res.json() as Config
  webpush.setVapidDetails('mailto:cloudygetty@gmail.com', config.public, config.private)
  return config
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let cfg: Config
  try { cfg = await getConfig() } catch (e) { console.error('[notify] config', e); return json({ error: 'config' }, 500) }
  if (req.headers.get('x-notify-secret') !== cfg.secret) return json({ error: 'unauthorized' }, 401)

  let p: { user_id?: string; title?: string; body?: string; url?: string; tag?: string }
  try { p = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  if (!p.user_id || !/^[0-9a-f-]{36}$/i.test(p.user_id)) return json({ error: 'bad_user' }, 400)

  const subsRes = await rest(`push_subscriptions?user_id=eq.${p.user_id}&select=id,endpoint,p256dh,auth`)
  const subs = subsRes.ok ? await subsRes.json() as { id: string; endpoint: string; p256dh: string; auth: string }[] : []
  const payload = JSON.stringify({
    title: (p.title ?? 'Hole Eaters').slice(0, 80),
    body: (p.body ?? '').slice(0, 160),
    tag: p.tag ?? 'he-notification',
    data: { url: p.url ?? '/' },
  })

  let sent = 0
  const dead: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) dead.push(s.id)
      else console.error('[notify] send failed', code, (e as Error).message)
    }
  }))
  if (dead.length) await rest(`push_subscriptions?id=in.(${dead.join(',')})`, { method: 'DELETE' })
  if (sent) await rest(`push_subscriptions?user_id=eq.${p.user_id}`, { method: 'PATCH', body: JSON.stringify({ last_used_at: new Date().toISOString() }) })
  return json({ sent, removed: dead.length })
})
