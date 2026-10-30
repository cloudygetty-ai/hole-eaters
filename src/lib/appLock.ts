// Startup lock: a PIN asked for when the app opens, and again after it's been in the background a while.
// Stored only on this device as a salted PBKDF2 hash (never the PIN itself, never sent anywhere).

const KEY = 'he_app_lock'
const RELOCK_AFTER_MS = 60_000
const ITERATIONS = 150_000

interface Stored { salt: string; hash: string }

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 256)
}

function read(): Stored | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) as Stored : null } catch { return null }
}

export const lockEnabled = () => !!read()

export async function setPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  localStorage.setItem(KEY, JSON.stringify({ salt: b64(salt), hash: b64(await derive(pin, salt)) }))
}

export function clearPin() { try { localStorage.removeItem(KEY) } catch { /* noop */ } }

export async function checkPin(pin: string): Promise<boolean> {
  const s = read()
  if (!s) return true
  const got = new Uint8Array(await derive(pin, unb64(s.salt))), want = unb64(s.hash)
  if (got.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i] // constant-time compare
  return diff === 0
}

/** Calls `lock()` when the app comes back after RELOCK_AFTER_MS in the background. */
export function watchBackground(lock: () => void): () => void {
  let hiddenAt = 0
  const onVis = () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS && lockEnabled()) lock()
  }
  document.addEventListener('visibilitychange', onVis)
  return () => document.removeEventListener('visibilitychange', onVis)
}
