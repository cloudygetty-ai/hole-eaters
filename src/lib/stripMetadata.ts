// Removes hidden location data before anything is uploaded.
// Phone photos carry EXIF GPS (often someone's home); phone videos carry an ISO 6709 location stamp.
//  - Photos: redrawn onto a canvas and re-encoded, which drops ALL metadata. Rotation is applied first.
//  - Videos: the location stamp is overwritten in place with zeros (same length, so the file stays valid).
//  - GIFs are passed through (re-encoding would kill animation; GIF has no EXIF GPS block).

const MAX_EDGE = 2560 // also trims 40-megapixel originals down to something sane

export async function stripMetadata(file: File): Promise<File> {
  try {
    if (file.type.startsWith('image/') && file.type !== 'image/gif') return await reencodeImage(file)
    if (file.type.startsWith('video/')) return await scrubVideoLocation(file)
  } catch (e) {
    console.warn('[strip] could not clean file, refusing to upload it as-is', e)
    throw new Error('metadata_strip_failed')
  }
  return file
}

async function reencodeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no_canvas')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
  const type = keepAlpha ? 'image/webp' : 'image/jpeg'
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, type, 0.9))
  if (!blob) throw new Error('encode_failed')
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'photo'
  return new File([blob], `${base}.${keepAlpha ? 'webp' : 'jpg'}`, { type, lastModified: Date.now() })
}

// ISO 6709 point like "+40.7484-073.9857+012.000/" (iPhone ©xyz atom and com.apple.quicktime.location.ISO6709)
const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?\//g
const SCAN = 4 * 1024 * 1024 // metadata (moov) sits at the start or the end of the file

async function scrubVideoLocation(file: File): Promise<File> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const regions: [number, number][] = buf.length <= SCAN * 2 ? [[0, buf.length]] : [[0, SCAN], [buf.length - SCAN, buf.length]]
  let changed = false
  for (const [start, end] of regions) {
    // latin1 keeps a 1:1 byte ↔ char mapping, so match indexes are byte offsets
    const text = new TextDecoder('latin1').decode(buf.subarray(start, end))
    for (const m of text.matchAll(ISO6709)) {
      const at = start + (m.index ?? 0)
      for (let i = 0; i < m[0].length; i++) {
        const c = m[0][i]
        if (c >= '0' && c <= '9') { buf[at + i] = 0x30; changed = true } // digit → '0', length unchanged
      }
    }
  }
  return changed ? new File([buf], file.name, { type: file.type, lastModified: Date.now() }) : file
}
