import { useRef, type ReactNode } from 'react'

// Twitter-style cover banner. Shows the cover photo, else the profile video, else a branded fallback.
// Pass onPick to make it editable (tap the camera button to choose a new image).
export function CoverBanner({ url, videoUrl, height, accent, onPick, uploading = false, rounded = false, children }: {
  url?: string | null
  videoUrl?: string | null
  height: number
  accent: string
  onPick?: (file: File) => void
  uploading?: boolean
  rounded?: boolean
  children?: ReactNode
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{
      position: 'relative', height, overflow: 'hidden',
      borderRadius: rounded ? '20px 20px 0 0' : 0,
      background: `radial-gradient(120% 140% at 85% 0%, ${accent}40, transparent 60%), linear-gradient(135deg, #1c1309, #0b0b10 70%)`,
    }}>
      {url ? (
        <img src={url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : videoUrl ? (
        <video src={videoUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} autoPlay muted loop playsInline />
      ) : (
        <img src="/brand/emblem.webp" alt="" aria-hidden style={{ position: 'absolute', right: -24, top: -18, width: height * 1.25, opacity: 0.14, mixBlendMode: 'lighten' }} />
      )}
      {/* Bottom fade so the overlapping avatar and text stay readable on bright covers */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 35%, transparent 60%, rgba(8,9,13,0.55) 100%)' }} />

      {onPick && (
        <>
          <button type="button" aria-label="Change cover photo" disabled={uploading} onClick={() => fileRef.current?.click()}
            style={{ position: 'absolute', right: 12, bottom: 12, padding: '7px 12px', borderRadius: 18, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)', zIndex: 2 }}>
            {uploading ? 'Uploading…' : url ? '📷 Change cover' : '📷 Add cover'}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f) }} />
        </>
      )}
      {children}
    </div>
  )
}
