// ─── Push notification handler ─────────────────────────────────────────────
// Imported by the Workbox-generated service worker via importScripts.
// Pushes are sent by the Supabase `notify` edge function (likes, taps, messages, views).

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Hole Eaters', body: event.data.text() } }

  const { title = 'Hole Eaters', body = '', icon = '/icons/icon-192.png', badge = '/icons/icon-192.png', tag, data = {} } = payload

  event.waitUntil((async () => {
    // If the app is open and on screen, its own in-app toast already shows this; skip the duplicate.
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: tag ?? 'he-notification',
      renotify: true,
      vibrate: [100, 50, 100],
      data,
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((c) => ('navigate' in c ? c.navigate(url) : c))
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
