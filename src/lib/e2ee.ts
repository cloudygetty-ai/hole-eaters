// End-to-end encryption for 1:1 chats (WebCrypto only, no dependencies).
//
// Keys: every browser/phone has its own ECDH P-256 key pair. The private key is created
// non-extractable and kept in IndexedDB, so it never leaves the device (not even to our server).
// Public keys go to `user_keys`.
//
// Messages: a fresh AES-256-GCM key seals the payload ({ t: text, s: sticker, m: file }). That key is
// wrapped (AES-KW) once per device of both people, using ECDH(this device, that device). The row stores
// { v: 1, sd: sender device, iv, ct, k: { deviceId: wrappedKey } } and nothing readable.
//
// Files: encrypted with their own AES-GCM key before upload; the key travels inside the sealed payload.

import { supabase } from './supabase'

export interface SealedPayload { t?: string; s?: string; m?: { p: string; k: string; iv: string; mime: string; kind: 'image' | 'video' | 'audio' } }
export interface Envelope { v: 1; sd: string; iv: string; ct: string; k: Record<string, string> }
interface DeviceKey { deviceId: string; userId: string; publicKey: CryptoKey }
interface LocalDevice { deviceId: string; userId: string; privateKey: CryptoKey; publicJwk: JsonWebKey }

const ECDH: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' }
const te = new TextEncoder(), td = new TextDecoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => { let s = ''; new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).forEach(c => s += String.fromCharCode(c)); return btoa(s) }
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

// ── IndexedDB (one record per signed-in user on this device) ───────────────────
const DB = 'he-e2ee', STORE = 'devices'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb()
  return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error) })
}
async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await idb()
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error) })
}

// ── This device ────────────────────────────────────────────────────────────────
let current: LocalDevice | null = null

/** Creates (first run) or loads this device's key and makes sure the server has its public half. */
export async function ensureDeviceKey(userId: string): Promise<LocalDevice> {
  if (current?.userId === userId) return current
  let dev = await idbGet<LocalDevice>(userId)
  if (dev) {
    // Re-register if the server row was removed (e.g. pruned after 10 devices)
    const { data } = await supabase.from('user_keys').select('device_id').eq('device_id', dev.deviceId).maybeSingle()
    if (!data) dev = undefined
    else supabase.from('user_keys').update({ last_seen_at: new Date().toISOString() }).eq('device_id', dev.deviceId).then(() => {})
  }
  if (!dev) {
    const pair = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']) as CryptoKeyPair
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const pub = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }
    const { data, error } = await supabase.from('user_keys').insert({ user_id: userId, public_key: pub }).select('device_id').single()
    if (error || !data) throw new Error('key_register_failed')
    dev = { deviceId: data.device_id as string, userId, privateKey: pair.privateKey, publicJwk: pub }
    await idbPut(userId, dev)
  }
  current = dev
  return dev
}

// ── Other devices' public keys ─────────────────────────────────────────────────
const keyCache = new Map<string, DeviceKey>()                 // by device id
const userCache = new Map<string, { at: number; ids: string[] }>()

async function importPub(jwk: JsonWebKey) { return crypto.subtle.importKey('jwk', jwk, ECDH, false, []) }

async function loadRows(rows: { device_id: string; user_id: string; public_key: JsonWebKey }[]) {
  for (const r of rows) if (!keyCache.has(r.device_id)) keyCache.set(r.device_id, { deviceId: r.device_id, userId: r.user_id, publicKey: await importPub(r.public_key) })
}

export async function devicesFor(userIds: string[], fresh = false): Promise<DeviceKey[]> {
  const need = userIds.filter(u => fresh || !userCache.has(u) || Date.now() - userCache.get(u)!.at > 120_000)
  if (need.length) {
    const { data } = await supabase.from('user_keys').select('device_id,user_id,public_key').in('user_id', need)
    await loadRows((data ?? []) as never)
    need.forEach(u => userCache.set(u, { at: Date.now(), ids: (data ?? []).filter(r => r.user_id === u).map(r => r.device_id as string) }))
  }
  return userIds.flatMap(u => (userCache.get(u)?.ids ?? []).map(id => keyCache.get(id)!).filter(Boolean))
}

async function deviceById(id: string): Promise<DeviceKey | null> {
  if (!keyCache.has(id)) {
    const { data } = await supabase.from('user_keys').select('device_id,user_id,public_key').eq('device_id', id).maybeSingle()
    if (data) await loadRows([data as never])
  }
  return keyCache.get(id) ?? null
}

async function wrapKeyFor(me: LocalDevice, peer: CryptoKey) {
  return crypto.subtle.deriveKey({ name: 'ECDH', public: peer }, me.privateKey, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'])
}

// ── Seal / open ────────────────────────────────────────────────────────────────
export class NoKeysError extends Error { constructor() { super('recipient_has_no_keys') } }

export async function seal(payload: SealedPayload, me: LocalDevice, otherUserId: string): Promise<Envelope> {
  let theirs = await devicesFor([otherUserId])
  if (!theirs.length) theirs = await devicesFor([otherUserId], true)
  if (!theirs.length) throw new NoKeysError()
  const mine = await devicesFor([me.userId], true)
  const targets = [...theirs, ...mine.filter(d => !theirs.some(t => t.deviceId === d.deviceId))]
  if (!targets.some(t => t.deviceId === me.deviceId)) targets.push({ deviceId: me.deviceId, userId: me.userId, publicKey: await importPub(me.publicJwk) })

  const cek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cek, te.encode(JSON.stringify(payload)))
  const k: Record<string, string> = {}
  for (const t of targets.slice(0, 20)) k[t.deviceId] = b64(await crypto.subtle.wrapKey('raw', cek, await wrapKeyFor(me, t.publicKey), 'AES-KW'))
  return { v: 1, sd: me.deviceId, iv: b64(iv), ct: b64(ct), k }
}

export async function open(env: Envelope, me: LocalDevice): Promise<SealedPayload | null> {
  try {
    const wrapped = env.k?.[me.deviceId]
    if (!wrapped) return null // sent before this device existed
    const sender = env.sd === me.deviceId ? { publicKey: await importPub(me.publicJwk) } : await deviceById(env.sd)
    if (!sender) return null
    const cek = await crypto.subtle.unwrapKey('raw', unb64(wrapped), await wrapKeyFor(me, sender.publicKey), 'AES-KW', 'AES-GCM', false, ['decrypt'])
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, cek, unb64(env.ct))
    return JSON.parse(td.decode(pt)) as SealedPayload
  } catch {
    return null
  }
}

// ── Files ──────────────────────────────────────────────────────────────────────
export async function encryptFile(file: Blob): Promise<{ blob: Blob; key: string; iv: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer())
  return { blob: new Blob([ct], { type: 'application/octet-stream' }), key: b64(await crypto.subtle.exportKey('raw', key)), iv: b64(iv) }
}

export async function decryptFile(data: ArrayBuffer, keyB64: string, ivB64: string, mime: string): Promise<Blob> {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, data)
  return new Blob([pt], { type: mime })
}
