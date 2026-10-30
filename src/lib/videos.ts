// Data layer for video posts. UI never talks to storage or the edge function directly.
import { stripMetadata } from './stripMetadata'
import { supabase, SUPABASE_URL } from './supabase'

export type VideoStatus = 'uploading' | 'pending_review' | 'approved' | 'rejected' | 'removed'
export type VideoReportReason = 'underage' | 'non_consensual' | 'illegal' | 'spam' | 'other'

export interface FeedVideo {
  id: string
  uploader_id: string
  caption: string | null
  tags: string[]
  view_count: number
  approved_at: string
  created_at: string
  status: VideoStatus
  url: string
  uploader?: { id: string; name: string; emoji: string; color: string; photo_url: string | null } | null
}

const PAGE = 8
const SIGNED_TTL_S = 3600
const SELECT = 'id, uploader_id, storage_path, caption, tags, view_count, approved_at, created_at, status'

export class VideoApiError extends Error {}

async function callFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('video-upload', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const payload = ctx ? await ctx.json().catch(() => null) : null
    throw new VideoApiError(payload?.error ?? 'network')
  }
  return data as T
}

type Row = Omit<FeedVideo, 'url' | 'uploader'> & { storage_path: string }

async function sign(rows: Row[]): Promise<FeedVideo[]> {
  if (!rows.length) return []
  const [{ data: signed }, { data: profiles }] = await Promise.all([
    supabase.storage.from('videos').createSignedUrls(rows.map(r => r.storage_path), SIGNED_TTL_S),
    supabase.from('profiles').select('id, name, emoji, color, photo_url').in('id', [...new Set(rows.map(r => r.uploader_id))]),
  ])
  const byId = new Map((profiles ?? []).map(p => [p.id, p]))
  return rows
    .map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? '', uploader: byId.get(r.uploader_id) ?? null }))
    .filter(v => v.url)
}

/** Approved feed, newest first. RLS hides anything not approved or missing co-performer consent. */
export async function fetchFeed(cursor?: string): Promise<FeedVideo[]> {
  let q = supabase.from('videos').select(SELECT).eq('status', 'approved').order('approved_at', { ascending: false }).limit(PAGE)
  if (cursor) q = q.lt('approved_at', cursor)
  const { data, error } = await q
  if (error) throw error
  return sign((data ?? []) as Row[])
}

export const FEED_PAGE_SIZE = PAGE

export async function fetchReviewQueue(): Promise<FeedVideo[]> {
  const { data, error } = await supabase.from('videos').select(SELECT).eq('status', 'pending_review').order('created_at').limit(50)
  if (error) throw error
  return sign((data ?? []) as Row[])
}

export async function getMyVerification(): Promise<'none' | 'pending' | 'verified' | 'failed'> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'none'
  const { data } = await supabase.from('creator_verifications').select('status').eq('user_id', user.id).maybeSingle()
  return (data?.status as 'none' | 'pending' | 'verified' | 'failed' | undefined) ?? 'none'
}

export async function resolveHandles(names: string[]): Promise<string[]> {
  if (!names.length) return []
  // TODO[P1] profiles.name isn't unique; switch to a canonical handle once one exists.
  const { data } = await supabase.from('profiles').select('id, name').in('name', names)
  const found = new Map((data ?? []).map(p => [p.name, p.id]))
  if (names.some(n => !found.has(n))) throw new VideoApiError('performer_not_found')
  return names.map(n => found.get(n)!)
}

export interface UploadInput {
  file: File
  caption: string
  tags: string[]
  performerIds: string[]
  onProgress: (pct: number) => void
}

/** init → direct PUT to storage (XHR for progress) → finalize. Returns the new video id. */
export async function uploadVideo({ file, caption, tags, performerIds, onProgress }: UploadInput): Promise<string> {
  // Wipe the phone's location stamp first (same byte length, so the declared size still matches)
  file = await stripMetadata(file)
  const { videoId, path, token } = await callFn<{ videoId: string; path: string; token: string }>({
    action: 'init', mime: file.type, size: file.size, caption, tags, performerIds, attest: true,
  })
  const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/videos/${path}?token=${encodeURIComponent(token)}`
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('content-type', file.type)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new VideoApiError(`upload_${xhr.status}`)))
    xhr.onerror = () => reject(new VideoApiError('network'))
    xhr.send(file)
  })
  await callFn({ action: 'finalize', videoId })
  return videoId
}

export function moderateVideo(videoId: string, decision: 'approve' | 'reject' | 'remove', reason?: string) {
  return callFn<{ status: VideoStatus }>({ action: 'moderate', videoId, decision, reason })
}

export function respondToTag(videoId: string, decision: 'granted' | 'revoked') {
  return callFn<{ ok: true }>({ action: 'consent', videoId, decision })
}

export async function reportVideo(videoId: string, reason: VideoReportReason, details?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new VideoApiError('unauthorized')
  const { error } = await supabase.from('video_reports').insert({ video_id: videoId, reporter_id: user.id, reason, details: details ?? null })
  if (error && error.code !== '23505') throw error
}

export function countView(videoId: string) {
  return supabase.rpc('increment_video_view', { vid: videoId })
}

export const UPLOAD_ERROR_COPY: Record<string, string> = {
  verification_required: 'Verify your age to post videos.',
  performer_not_verified: 'Everyone tagged has to verify their age first.',
  performer_not_found: 'Couldn’t find one of the tagged names.',
  daily_limit: 'Daily limit is 5 uploads. Try again tomorrow.',
  too_large: 'Max file size is 500 MB.',
  unsupported_type: 'Use MP4, MOV, or WebM.',
  attestation_required: 'Confirm all three boxes to post.',
}
