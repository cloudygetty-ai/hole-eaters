import type { ImgHTMLAttributes, VideoHTMLAttributes } from 'react'
import { useMediaUrl } from '../lib/mediaUrl'

// <img>/<video> for profile media in the private `media` bucket: swaps the stored URL for a short-lived
// signed one. Long-press "save image" and dragging are switched off on these.
const noSave = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as const

export function MediaImg({ src, style, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null | undefined }) {
  const url = useMediaUrl(src)
  if (!url) return <span aria-hidden style={{ display: 'block', width: '100%', height: '100%', ...style, background: 'rgba(255,255,255,0.04)' }} />
  return <img src={url} draggable={false} onContextMenu={e => e.preventDefault()} style={{ ...noSave, ...style }} {...rest} />
}

export function MediaVideo({ src, style, ...rest }: Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & { src: string | null | undefined }) {
  const url = useMediaUrl(src)
  if (!url) return <span aria-hidden style={{ display: 'block', width: '100%', height: '100%', ...style, background: 'rgba(255,255,255,0.04)' }} />
  return <video src={url} onContextMenu={e => e.preventDefault()} style={{ ...noSave, ...style }} {...rest} />
}
