// The parts of MapLibre the app uses (see ./mapEngine). A type-only reference: no code is pulled in.
export type MapLib = typeof import('./mapEngine').default

// MapLibre is about 0.9 MB, over half of the app's code. Loading it on demand lets sign-in,
// chat and the inbox paint without waiting for it, and keeps it in a chunk that app-only
// deploys don't change, so phones don't download it again after every release.
let pending: Promise<MapLib> | null = null

export function loadMapLib(): Promise<MapLib> {
  // A failed load (offline, flaky network) isn't cached, so the next call tries again.
  pending ??= import('./mapEngine')
    .then(m => m.default)
    .catch(err => { pending = null; throw err })
  return pending
}
