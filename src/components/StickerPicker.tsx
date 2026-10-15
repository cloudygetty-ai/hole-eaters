import { STICKERS, stickerUrl } from '../lib/stickers'

// Bottom sheet grid of stickers. Tapping one calls onPick with its URL.
export function StickerPicker({ title, onPick, onClose, background, border }: {
  title: string; onPick: (url: string) => void; onClose: () => void; background: string; border: string
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div role="dialog" aria-label={title} style={{ position: 'relative', background, borderTop: `1px solid ${border}`, borderRadius: '20px 20px 0 0', maxHeight: '62vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 8px' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <button aria-label="Close stickers" onClick={onClose} style={{ fontSize: 16, opacity: 0.7, padding: 4 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 12px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {STICKERS.map(s => (
            <button key={s.id} aria-label={s.label} title={s.label} onClick={() => onPick(stickerUrl(s.id))}
              style={{ aspectRatio: '1', borderRadius: 14, padding: 6, background: 'transparent', transition: 'transform 0.1s' }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
              onPointerUp={e => (e.currentTarget.style.transform = '')} onPointerLeave={e => (e.currentTarget.style.transform = '')}>
              <img src={stickerUrl(s.id)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
