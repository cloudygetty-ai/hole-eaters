// Chat on top of e2ee.ts: what the chat screen calls instead of writing plaintext to `messages`.
// Rows on the server carry only `enc`; the screen works with decrypted "view" messages.

import { supabase, type Message } from './supabase'
import { ensureDeviceKey, seal, open, encryptFile, decryptFile, NoKeysError, type SealedPayload } from './e2ee'
import { stripMetadata } from './stripMetadata'

export { NoKeysError }

/** A decrypted message. `media_url` is "e2ee:<message id>" for an encrypted file, or a sticker path. */
export type ChatView = Message & { enc?: unknown; file?: SealedPayload['m']; locked?: boolean }

export async function sendSecure(matchId: string, myId: string, otherId: string, payload: SealedPayload): Promise<ChatView> {
  const me = await ensureDeviceKey(myId)
  const enc = await seal(payload, me, otherId)
  const { data, error } = await supabase.from('messages')
    .insert({ match_id: matchId, sender_id: myId, content: '', media_url: null, media_type: null, enc })
    .select().single()
  if (error || !data) throw error ?? new Error('send_failed')
  return toView(data as ChatView, payload)
}

/** Strip location data, encrypt, upload to the private chat bucket. Only the key holders can read it. */
export async function uploadSecureFile(matchId: string, myId: string, file: File, kind: 'image' | 'video' | 'audio'): Promise<NonNullable<SealedPayload['m']>> {
  const clean = await stripMetadata(file)
  const { blob, key, iv } = await encryptFile(clean)
  const name = `${matchId}/${myId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.bin`
  const { error } = await supabase.storage.from('chat').upload(name, blob, { contentType: 'application/octet-stream' })
  if (error) throw error
  return { p: name, k: key, iv, mime: clean.type || 'application/octet-stream', kind }
}

function toView(row: ChatView, payload: SealedPayload | null): ChatView {
  if (!payload) return { ...row, content: '🔒 Sent before this device was set up', media_url: null, media_type: null, locked: true }
  return {
    ...row,
    content: payload.t ?? '',
    media_url: payload.m ? `e2ee:${row.id}` : payload.s ?? null,
    media_type: payload.m?.kind ?? (payload.s ? 'image' : null),
    file: payload.m,
  }
}

/** Decrypts a row from the server. Old plaintext rows (before encryption) pass through unchanged. */
export async function viewMessage(row: ChatView, myId: string): Promise<ChatView> {
  if (!row.enc) return row
  const me = await ensureDeviceKey(myId)
  return toView(row, await open(row.enc as never, me))
}

const blobCache = new Map<string, Promise<string | null>>()
/** Downloads and decrypts an attached file; returns a local blob: URL (cached per file). */
export function fileUrl(file: NonNullable<SealedPayload['m']>): Promise<string | null> {
  if (!blobCache.has(file.p)) {
    blobCache.set(file.p, (async () => {
      const { data } = await supabase.storage.from('chat').download(file.p)
      if (!data) return null
      return URL.createObjectURL(await decryptFile(await data.arrayBuffer(), file.k, file.iv, file.mime))
    })().catch(() => null))
  }
  return blobCache.get(file.p)!
}
