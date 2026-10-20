// ─── Web Push subscription manager ────────────────────────────────────────────

// VAPID public key — matches the private key used by your push server
// Private half lives in the Supabase vault (vapid_private_key), used by the `notify` edge function.
export const VAPID_PUBLIC_KEY = 'BIl5XZYSLrhpeqrb-kVlc4BuE6Mz7olBxOPJNU6Wk4iFo5O5e_hnQTCXnVLr3ZQnaDbxZrbq0CtZ7pb1HMTfTWM'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushPermission
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result as PushPermission
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      // Subscriptions made with the old key can't receive our pushes; replace them
      const current = existing.options.applicationServerKey
      const wanted = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      const same = current && new Uint8Array(current).every((b, i) => b === wanted[i]) && current.byteLength === wanted.length
      if (same) return existing
      await existing.unsubscribe()
    }

    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
    })
  } catch (e) {
    console.warn('[Push] Subscribe failed:', e)
    return null
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
}

// ─── Local notification (no server required) ────────────────────────────────
// Fires a notification directly from the SW registration — works while tab is open too
export async function showLocalNotification(title: string, body: string, tag: string, url = '/') {
  if (!pushSupported() || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url },
    })
  } catch (e) {
    // Fallback to Notification API if SW isn't ready
    new Notification(title, { body, icon: '/icons/icon-192.png', tag })
  }
}

// ─── In-app notification (tab is focused) ─────────────────────────────────
type NotifyCallback = (title: string, body: string, tag: string) => void
const _listeners = new Set<NotifyCallback>()

export function onInAppNotification(cb: NotifyCallback): () => void {
  _listeners.add(cb)
  return () => { _listeners.delete(cb) }
}

export function dispatchInApp(title: string, body: string, tag: string) {
  _listeners.forEach(cb => cb(title, body, tag))
}

// ─── Smart notify: in-app if focused, push if backgrounded ────────────────
export async function notify(title: string, body: string, tag: string, url = '/') {
  if (document.visibilityState === 'visible') {
    dispatchInApp(title, body, tag)
  } else {
    await showLocalNotification(title, body, tag, url)
  }
}

// ─── iOS only delivers web push to apps added to the Home Screen ──────────
export function isIosBrowserTab(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  return ios && !standalone
}
