// ─── Push notification handler ─────────────────────────────────────────────
// This file is imported by the Workbox-generated service worker via importScripts

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Hole Eaters', body: event.data.text() } }

  const { title = 'Hole Eaters', body = '', icon = '/icons/icon-192.png', badge = '/icons/icon-192.png', tag, data = {} } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: tag ?? 'he-notification',
      renotify: true,
      vibrate: [100, 50, 100],
      data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
