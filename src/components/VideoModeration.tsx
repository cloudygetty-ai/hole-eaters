import { useEffect, useState } from 'react'
import { fetchReviewQueue, moderateVideo, type FeedVideo } from '../lib/videos'
import type { VideoTheme } from './VideoFeed'

// Admin review queue. Reported videos re-enter here automatically (on_video_report trigger).
export function VideoModeration({ theme: t }: { theme: VideoTheme }) {
  const [queue, setQueue] = useState<FeedVideo[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetchReviewQueue().then(setQueue).catch(e => { console.error('[videos] queue', e); setErr('Couldn’t load the queue.'); setQueue([]) })
  }, [])

  const decide = async (id: string, decision: 'approve' | 'reject' | 'remove') => {
    const reason = decision === 'approve' ? undefined : prompt('Reason (shown in admin log)') ?? undefined
    setBusy(id)
    try {
      await moderateVideo(id, decision, reason)
      setQueue(q => q?.filter(v => v.id !== id) ?? null)
    } catch (e) {
      setErr(`Action failed: ${(e as Error).message}`)
    } finally { setBusy(null) }
  }

  if (!queue) return <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {err && <div style={{ color: t.accent, fontSize: 13 }}>{err}</div>}
      {!queue.length && <div style={{ textAlign: 'center', color: t.dim, padding: 40 }}>Queue is clear.</div>}
      {queue.map(v => (
        <div key={v.id} style={{ background: t.surf2, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <video src={v.url} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 360, background: '#000', display: 'block' }} />
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13 }}><b>{v.uploader?.name ?? 'Unknown'}</b> · <span style={{ color: t.dim, fontFamily: t.font, fontSize: 11 }}>{new Date(v.created_at).toLocaleString()}</span></div>
            {v.caption && <div style={{ fontSize: 13, color: t.muted }}>{v.caption}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={busy === v.id} onClick={() => decide(v.id, 'approve')} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#22c55e22', border: '1px solid #22c55e55', color: '#22c55e', fontWeight: 700, fontSize: 13 }}>Approve</button>
              <button disabled={busy === v.id} onClick={() => decide(v.id, 'reject')} style={{ flex: 1, padding: 10, borderRadius: 10, background: `${t.accent}18`, border: `1px solid ${t.accent}44`, color: t.accent, fontWeight: 700, fontSize: 13 }}>Reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
