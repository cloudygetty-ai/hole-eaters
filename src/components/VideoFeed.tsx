import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchFeed, uploadVideo, reportVideo, countView, getMyVerification, resolveHandles,
  FEED_PAGE_SIZE, UPLOAD_ERROR_COPY, VideoApiError, type FeedVideo, type VideoReportReason,
} from '../lib/videos'

export interface VideoTheme {
  bg: string; surface: string; surf2: string; surf3: string
  border: string; border2: string; text: string; dim: string; muted: string; accent: string; font: string
}

const REPORT_REASONS: { id: VideoReportReason; label: string }[] = [
  { id: 'underage', label: 'Someone looks under 18' },
  { id: 'non_consensual', label: 'Posted without consent' },
  { id: 'illegal', label: 'Illegal content' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Something else' },
]

function useFeed() {
  const [items, setItems] = useState<FeedVideo[]>([])
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  const cursor = useRef<string | undefined>(undefined)

  const loadMore = useCallback(async () => {
    if (busy.current || done) return
    busy.current = true
    setError(false)
    try {
      const next = await fetchFeed(cursor.current)
      cursor.current = next.at(-1)?.approved_at ?? cursor.current
      setItems(prev => [...prev, ...next.filter(n => !prev.some(p => p.id === n.id))])
      if (next.length < FEED_PAGE_SIZE) setDone(true)
    } catch (e) {
      console.error('[videos] feed', e)
      setError(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [done])

  const reset = useCallback(() => { cursor.current = undefined; setItems([]); setDone(false); setLoading(true) }, [])
  useEffect(() => { if (!items.length && !done) void loadMore() }, [items.length, done, loadMore])
  return { items, loadMore, done, loading, error, reset }
}

function ReportSheet({ t, onPick, onClose }: { t: VideoTheme; onPick: (r: VideoReportReason) => void; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: t.surface, borderRadius: '20px 20px 0 0', padding: '20px 16px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Report video</div>
        {REPORT_REASONS.map(r => (
          <button key={r.id} onClick={() => onPick(r.id)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: t.surf2, border: `1px solid ${t.border}`, fontSize: 14 }}>{r.label}</button>
        ))}
        <button onClick={onClose} style={{ padding: 12, color: t.dim, fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  )
}

function FeedCard({ item, t, onNearEnd }: { item: FeedVideo; t: VideoTheme; onNearEnd: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const counted = useRef(false)
  const [muted, setMuted] = useState(true)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.play().catch(() => {})
        onNearEnd()
        if (!counted.current) { counted.current = true; void countView(item.id) }
      } else el.pause()
    }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [item.id, onNearEnd])

  const submitReport = async (reason: VideoReportReason) => {
    setReporting(false)
    try { await reportVideo(item.id, reason); setReported(true) } catch (e) { console.error('[videos] report', e) }
  }

  return (
    <article style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', position: 'relative', background: '#000', flexShrink: 0 }}>
      <video ref={ref} src={item.url} muted={muted} loop playsInline preload="metadata" onClick={() => setMuted(m => !m)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      <div aria-hidden style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.5)', color: '#fff' }}>{muted ? '🔇 Tap for sound' : '🔊'}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '48px 16px 16px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', pointerEvents: 'none' }}>
        {item.uploader && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>{item.uploader.emoji}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: item.uploader.color }}>{item.uploader.name}</span>
          </div>
        )}
        {item.caption && <p style={{ fontSize: 14, lineHeight: 1.4, margin: '0 0 6px', color: t.text }}>{item.caption}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {item.tags.map(tag => <span key={tag} style={{ fontSize: 12, color: t.accent }}>#{tag}</span>)}
          <span style={{ fontSize: 11, color: t.muted, fontFamily: t.font, marginLeft: 'auto' }}>{item.view_count.toLocaleString()} views</span>
        </div>
      </div>
      <button onClick={() => setReporting(true)} disabled={reported} aria-label="Report video"
        style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.5)', border: `1px solid ${t.border2}`, color: reported ? t.dim : '#fff' }}>
        {reported ? 'Reported' : '⚑ Report'}
      </button>
      {reporting && <ReportSheet t={t} onPick={submitReport} onClose={() => setReporting(false)} />}
    </article>
  )
}

const ATTESTATIONS = [
  'Everyone in this video is 18 or older.',
  'Everyone consented to being filmed and to this post.',
  'Every other person shown is tagged below.',
]

function UploadSheet({ t, onClose, onPosted }: { t: VideoTheme; onClose: () => void; onPosted: () => void }) {
  const [verification, setVerification] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [handles, setHandles] = useState('')
  const [checks, setChecks] = useState([false, false, false])
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => { getMyVerification().then(setVerification).catch(() => setVerification('none')) }, [])

  const split = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
  const ready = !!file && checks.every(Boolean) && progress === null && verification === 'verified'

  const submit = async () => {
    if (!file) return
    setMsg(null)
    try {
      const performerIds = await resolveHandles(split(handles))
      setProgress(0)
      await uploadVideo({ file, caption, tags: split(tags), performerIds, onProgress: setProgress })
      setProgress(null)
      setMsg({ ok: true, text: performerIds.length ? 'Posted. Goes live after review and once everyone tagged approves.' : 'Posted. Goes live after review.' })
      setFile(null); setCaption(''); setTags(''); setHandles(''); setChecks([false, false, false])
      onPosted()
    } catch (e) {
      setProgress(null)
      const code = e instanceof VideoApiError ? e.message : 'unknown'
      setMsg({ ok: false, text: UPLOAD_ERROR_COPY[code] ?? 'Upload failed. Try again.' })
    }
  }

  const field = { background: t.bg, border: `1px solid ${t.border2}`, borderRadius: 12, color: t.text, padding: 12, fontSize: 14 } as const

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label="Post a video" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: t.surface, borderTop: `1px solid ${t.border2}`, borderRadius: '20px 20px 0 0', padding: '20px 16px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Post a video</div>
          <button onClick={onClose} aria-label="Close" style={{ color: t.dim, fontSize: 22 }}>×</button>
        </div>

        {verification && verification !== 'verified' && (
          <div style={{ padding: 14, borderRadius: 12, background: `${t.accent}14`, border: `1px solid ${t.accent}44`, fontSize: 13, lineHeight: 1.5 }}>
            <b>Age verification required.</b> Every poster and everyone in the video verifies once with a government ID.
            {verification === 'pending' ? ' Your check is in progress.' : ' '}
            {/* TODO[P0] link to the ID-verification provider flow (Yoti / Veriff / Persona) once contracted. */}
            {verification !== 'pending' && <span style={{ color: t.accent, fontWeight: 700 }}>Verification opens soon.</span>}
          </div>
        )}

        <label style={{ ...field, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <span style={{ color: file ? t.text : t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ? file.name : 'Choose video (MP4, MOV, WebM · 500 MB max)'}</span>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <textarea placeholder="Caption" maxLength={500} rows={2} value={caption} onChange={e => setCaption(e.target.value)} style={{ ...field, resize: 'none' }} />
        <input placeholder="Tags, comma separated" value={tags} onChange={e => setTags(e.target.value)} style={field} />
        <input placeholder="Tag others in the video (names, comma separated)" value={handles} onChange={e => setHandles(e.target.value)} style={field} />

        {ATTESTATIONS.map((label, i) => (
          <label key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: t.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={checks[i]} onChange={() => setChecks(c => c.map((v, j) => (j === i ? !v : v)))} style={{ accentColor: t.accent, marginTop: 2 }} />
            {label}
          </label>
        ))}

        {progress !== null && (
          <div style={{ height: 6, borderRadius: 3, background: t.surf3, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: t.accent, transition: 'width 0.2s' }} />
          </div>
        )}
        {msg && <div role="status" style={{ fontSize: 13, color: msg.ok ? '#22c55e' : t.accent }}>{msg.text}</div>}

        <button onClick={submit} disabled={!ready}
          style={{ padding: 14, borderRadius: 12, background: t.accent, color: '#fff', fontWeight: 800, fontSize: 15, opacity: ready ? 1 : 0.4 }}>
          {progress !== null ? `Uploading ${progress}%` : 'Post'}
        </button>
        <div style={{ fontSize: 11, color: t.dim, lineHeight: 1.5 }}>Every video is reviewed before it goes live. Posting anyone without consent gets your account banned.</div>
      </div>
    </div>
  )
}

export function VideoFeed({ theme: t, canPost }: { theme: VideoTheme; canPost: boolean }) {
  const { items, loadMore, done, loading, error, reset } = useFeed()
  const [uploading, setUploading] = useState(false)

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollSnapType: 'y mandatory', display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => (
          <FeedCard key={it.id} item={it} t={t} onNearEnd={() => { if (i >= items.length - 2 && !done) void loadMore() }} />
        ))}
        {loading && <div style={{ margin: 'auto', color: t.dim, fontSize: 13 }}>Loading…</div>}
        {!loading && error && (
          <button onClick={() => void loadMore()} style={{ margin: 'auto', color: t.accent, fontSize: 13 }}>Couldn’t load videos. Tap to retry.</button>
        )}
        {!loading && !error && done && !items.length && (
          <div style={{ margin: 'auto', textAlign: 'center', color: t.dim, fontSize: 14, padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎬</div>
            No videos yet. Be the first.
          </div>
        )}
      </div>
      {canPost && (
        <button onClick={() => setUploading(true)} aria-label="Post a video"
          style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 5, padding: '12px 18px', borderRadius: 999, background: t.accent, color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          ＋ Post
        </button>
      )}
      {uploading && <UploadSheet t={t} onClose={() => setUploading(false)} onPosted={reset} />}
    </div>
  )
}
