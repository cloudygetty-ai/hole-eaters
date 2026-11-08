// One place for upload limits and the messages people see when they hit them.
// The Supabase project is on the Free plan, whose per-file cap (50 MB) overrides any larger bucket limit.

export const MAX_UPLOAD_MB = 50
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024 - 64 * 1024 // headroom for encryption overhead

const VIDEO_TIP = 'Trim the clip, or record at 1080p (iPhone: Settings → Camera → Record Video).'

/** Human message if the file can't be uploaded, otherwise null. Check before any work starts. */
export function uploadTooBig(file: File): string | null {
  if (file.size <= MAX_UPLOAD_BYTES) return null
  const mb = Math.round(file.size / 1024 / 1024)
  return file.type.startsWith('video/')
    ? `That video is ${mb} MB. Max is ${MAX_UPLOAD_MB} MB. ${VIDEO_TIP}`
    : `That file is ${mb} MB. Max is ${MAX_UPLOAD_MB} MB.`
}

/** Turn a storage / pipeline error into something a person can act on. */
export function uploadErrorMessage(e: unknown, kind: 'video' | 'photo' | 'file' = 'file'): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown } | null)?.message ?? e ?? '')
  const status = Number((e as { statusCode?: unknown; status?: unknown } | null)?.statusCode ?? (e as { status?: unknown } | null)?.status)
  if (status === 413 || /exceeded the maximum allowed size|payload too large|entity too large/i.test(msg))
    return `Too big to upload. Max is ${MAX_UPLOAD_MB} MB.${kind === 'video' ? ` ${VIDEO_TIP}` : ''}`
  if (/mime|invalid_mime_type|not supported/i.test(msg)) return kind === 'video' ? 'Use an MP4, MOV or WebM video.' : 'That file type isn’t supported.'
  if (msg === 'metadata_strip_failed') return "Couldn't remove location data from that file, so it wasn't uploaded."
  if (/network|failed to fetch|load failed/i.test(msg)) return 'Connection dropped. Check your signal and try again.'
  return `Upload failed. Try again.`
}
