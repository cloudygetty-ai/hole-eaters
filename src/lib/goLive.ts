// "Go Live": while cruising, keep the screen awake and location fresh.
// PWAs can't track location in the background, so Live mode keeps the app in the foreground
// (Screen Wake Lock API) and syncs position more often. Auto-ends after LIVE_MAX_MS.

export const LIVE_MAX_MS = 2 * 60 * 60_000
export const LIVE_SYNC_MS = 8_000      // location sync interval while live (normal: 20 s)
export const NORMAL_SYNC_MS = 20_000

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void }
type WakeNav = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator

/**
 * Holds a screen wake lock until the returned stop() is called. The browser drops the lock whenever
 * the page is hidden, so it is re-requested each time the app comes back to the foreground.
 * onLost fires if the lock can't be (re)acquired, e.g. Low Power Mode on iOS.
 */
export function holdWakeLock(onLost: (why: string) => void): () => void {
  let sentinel: Sentinel | null = null
  let stopped = false
  const acquire = async () => {
    if (stopped || document.visibilityState !== 'visible') return
    try {
      sentinel = await (navigator as WakeNav).wakeLock!.request('screen')
      sentinel.addEventListener('release', () => { sentinel = null })
    } catch (e) {
      onLost(e instanceof Error ? e.message : 'Screen lock unavailable')
    }
  }
  const onVis = () => { if (document.visibilityState === 'visible' && !sentinel) acquire() }
  if (wakeLockSupported()) { acquire(); document.addEventListener('visibilitychange', onVis) }
  else onLost('This browser can’t keep the screen on')
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVis)
    sentinel?.release().catch(() => {})
    sentinel = null
  }
}

// ── Location permission ──────────────────────────────────────────────────────
export type LocStatus = 'pending' | 'ok' | 'denied' | 'unavailable'

/** Which set of "turn location back on" steps to show. */
export function locationPlatform(): 'ios-app' | 'ios-safari' | 'android' | 'desktop' {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (ios) return standalone ? 'ios-app' : 'ios-safari'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** Calls back when the browser's location permission flips (Chrome/Firefox; Safari has no onchange). */
export function watchLocationPermission(cb: (state: PermissionState) => void): () => void {
  let status: PermissionStatus | null = null
  const on = () => status && cb(status.state)
  navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then(s => { status = s; s.addEventListener('change', on) }).catch(() => {})
  return () => status?.removeEventListener('change', on)
}
