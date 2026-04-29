import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, signInAnon, upsertProfile, getNearbyUsers, likeUser, getMatches, getMessages, sendMessage, subscribeToMessages, uploadMedia, submitReport } from './lib/supabase'
import type { Profile, Match, Message, ReportReason } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#08090d', surface: '#0f1018', surf2: '#161821', surf3: '#1d1f2b',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.1)',
  text: '#f0f0f5', dim: '#6b6d7d', muted: '#9497aa',
  accent: '#ff4d6d', green: '#22c55e', blue: '#4d79ff', amber: '#eab308',
  purple: '#a855f7', orange: '#f97316',
}
const FONT = "'DM Mono', 'Fira Code', monospace"
const SANS = "'DM Sans', system-ui, sans-serif"

const ROLES = ['Top', 'Bottom', 'Versatile', 'Curious', 'Host']
const EMOJIS = ['🔥', '🐷', '🐻', '😈', '💦', '👅', '⛓️', '🌈']
const COLORS = [C.accent, C.purple, C.orange, '#ec4899', '#06b6d4', '#10b981']
const CRUISING = ['Hosting now', 'In my car', 'Come find me', 'Down for whatever', 'Just looking']

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: ${SANS}; -webkit-font-smoothing: antialiased; }
  button { cursor: pointer; border: none; background: none; color: inherit; font-family: inherit; }
  input, textarea { font-family: inherit; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes ping { 0%{transform:scale(1);opacity:1} 100%{transform:scale(2);opacity:0} }
  @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
`
// ─── PWA Install Banner ───────────────────────────────────────────────────────
function InstallBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa_dismissed') === '1')

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show || dismissed) return null

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setShow(false)
  }

  const dismiss = () => { setDismissed(true); localStorage.setItem('pwa_dismissed', '1') }

  return (
    <div style={{
      position: 'fixed', bottom: 76, left: 12, right: 12, zIndex: 300,
      background: '#1d1f2b', border: '1px solid rgba(255,77,109,0.3)',
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ fontSize: 28 }}>📍</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Add to Home Screen</div>
        <div style={{ fontSize: 12, color: '#9497aa', marginTop: 2 }}>Install for the full experience</div>
      </div>
      <button onClick={install} style={{ padding: '8px 16px', borderRadius: 8, background: '#ff4d6d', color: '#fff', fontWeight: 700, fontSize: 13 }}>Install</button>
      <button onClick={dismiss} style={{ color: '#6b6d7d', fontSize: 18, lineHeight: 1 }}>✕</button>
    </div>
  )
}



// ─── Seed profiles (shown when no GPS / no nearby users) ─────────────────────
const SEEDS: (Profile & { isSeed: true })[] = [
  { id: 's1', name: 'RawDog69', age: 34, emoji: '🔥', color: C.accent, role: 'Top', bio: 'No labels.', online: true, is_anon: false, tags: ['raw','nsfw'], cruising_status: 'Come find me', photo_url: null, video_url: null, last_seen: '', isSeed: true },
  { id: 's2', name: 'PigBottom88', age: 28, emoji: '🐷', color: C.purple, role: 'Bottom', bio: 'Use me.', online: true, is_anon: false, tags: ['sub','fetish'], cruising_status: 'Hosting now', photo_url: null, video_url: null, last_seen: '', isSeed: true },
  { id: 's3', name: 'DaddyBear', age: 47, emoji: '🐻', color: C.orange, role: 'Versatile', bio: 'Growl.', online: false, is_anon: false, tags: ['bear','dom'], cruising_status: null, photo_url: null, video_url: null, last_seen: '', isSeed: true },
  { id: 's4', name: 'CuriousCub', age: 23, emoji: '😈', color: '#10b981', role: 'Curious', bio: 'First time exploring.', online: true, is_anon: false, tags: ['curious'], cruising_status: 'Just looking', photo_url: null, video_url: null, last_seen: '', isSeed: true },
]

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ user, size = 44, showStatus = true }: { user: Partial<Profile>; size?: number; showStatus?: boolean }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${user.color}88, ${user.color}22)`,
        border: `2px solid ${user.color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', fontSize: size * 0.45,
      }}>
        {user.photo_url
          ? <img src={user.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          : user.emoji}
      </div>
      {showStatus && user.online && (
        <div style={{ position: 'absolute', bottom: 1, right: 1, width: size * 0.26, height: size * 0.26, background: C.green, borderRadius: '50%', border: `2px solid ${C.bg}` }} />
      )}
    </div>
  )
}

// ─── Pin (draggable) ──────────────────────────────────────────────────────────
function MyPin({ profile, pos, onMove }: { profile: Partial<Profile>; pos: { x: number; y: number }; onMove: (p: { x: number; y: number }) => void }) {
  const dragging = useRef(false)
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0, rw: 0, rh: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const onPointerDown = (e: React.PointerEvent) => {
    const r = document.querySelector('[data-map]')?.getBoundingClientRect()
    if (!r) return
    dragging.current = true; setIsDragging(true)
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y, rw: r.width, rh: r.height }
    window.addEventListener('pointermove', onMove_ as any)
    window.addEventListener('pointerup', onUp)
  }
  const onMove_ = (e: PointerEvent) => {
    if (!dragging.current) return
    const { mx, my, px, py, rw, rh } = origin.current
    onMove({ x: Math.max(4, Math.min(96, px + ((e.clientX - mx) / rw) * 100)), y: Math.max(4, Math.min(96, py + ((e.clientY - my) / rh) * 100)) })
  }
  const onUp = () => { dragging.current = false; setIsDragging(false); window.removeEventListener('pointermove', onMove_ as any); window.removeEventListener('pointerup', onUp) }

  return (
    <div style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%,-50%)', zIndex: 100 }}>
      {profile.cruising_status && (
        <div style={{ position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)', background: C.amber, color: '#000', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {profile.cruising_status}
        </div>
      )}
      <div onPointerDown={onPointerDown} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
        <Avatar user={{ ...profile, online: true }} size={48} />
      </div>
      <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: profile.color, animation: 'ping 1.5s infinite', opacity: 0.5 }} />
    </div>
  )
}

// ─── Profile Drawer ───────────────────────────────────────────────────────────
function ProfileDrawer({ user, myId, onClose, onLike, onMessage }: { user: Profile & { isSeed?: boolean }; myId: string; onClose: () => void; onLike: () => void; onMessage: () => void }) {
  const [tab, setTab] = useState<'profile' | 'vibe' | 'report'>('profile')
  const [liked, setLiked] = useState(false)
  const [reportReason, setReportReason] = useState<ReportReason>('fake_profile')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSent, setReportSent] = useState(false)

  const handleReport = async () => {
    if (!myId || user.isSeed) return
    await submitReport(myId, user.id, reportReason, reportDetails)
    setReportSent(true)
  }

  const handleLike = () => {
    setLiked(true)
    onLike()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: C.surf2, borderRadius: '20px 20px 0 0', padding: '0 0 32px', animation: 'slideUp 0.25s ease', maxHeight: '85vh', overflow: 'auto' }}>
        {/* Header photo area */}
        <div style={{ height: 180, background: `linear-gradient(135deg, ${user.color}33, ${user.color}11)`, position: 'relative', borderRadius: '20px 20px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar user={user} size={80} />
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', color: C.text, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          {user.cruising_status && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: C.amber, color: '#000', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{user.cruising_status}</div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 20px' }}>
          {(['profile', 'vibe', 'report'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: tab === t ? user.color : C.dim, borderBottom: `2px solid ${tab === t ? user.color : 'transparent'}`, textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '20px 20px 8px' }}>
          {tab === 'profile' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800 }}>{user.name}</span>
                <span style={{ fontSize: 16, color: C.muted }}>{user.age}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: user.color, background: `${user.color}22`, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{user.role}</span>
              </div>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>{user.bio || 'No bio.'}</p>
              {user.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {user.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 11, color: C.dim, background: C.surf3, padding: '3px 9px', borderRadius: 12, fontFamily: FONT }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'vibe' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🔮</div>
              <p style={{ color: C.muted, fontSize: 14 }}>Vibe check coming soon.</p>
              <p style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>AI compatibility score based on profiles.</p>
            </div>
          )}
          {tab === 'report' && (
            <div style={{ padding: '4px 0' }}>
              {reportSent ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <p style={{ fontWeight: 700 }}>Report submitted</p>
                  <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Our team will review it.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, color: C.muted }}>Why are you reporting {user.name}?</div>
                  <select value={reportReason} onChange={e => setReportReason(e.target.value as ReportReason)}
                    style={{ background: '#1d1f2b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#f0f0f5', fontSize: 14, outline: 'none' }}>
                    <option value="fake_profile">Fake Profile</option>
                    <option value="harassment">Harassment</option>
                    <option value="underage">Underage</option>
                    <option value="spam">Spam</option>
                    <option value="inappropriate_photo">Inappropriate Photo</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder="Additional details (optional)" rows={3}
                    style={{ background: '#1d1f2b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#f0f0f5', fontSize: 14, outline: 'none', resize: 'none' }} />
                  <button onClick={handleReport} disabled={user.isSeed}
                    style={{ padding: '12px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontWeight: 700, fontSize: 14 }}>
                    Submit Report
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, padding: '8px 20px 0' }}>
          <button onClick={handleLike} style={{ flex: 1, padding: '13px', borderRadius: 12, background: liked ? `${C.accent}33` : C.surf3, border: `1px solid ${liked ? C.accent : C.border2}`, color: liked ? C.accent : C.text, fontWeight: 700, fontSize: 14, transition: 'all 0.15s' }}>
            {liked ? '❤️ Liked' : '🤙 Like'}
          </button>
          {!user.isSeed && (
            <button onClick={onMessage} style={{ flex: 1, padding: '13px', borderRadius: 12, background: C.surf3, border: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 14 }}>
              💬 Message
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────
function ChatScreen({ match, myId, other, onBack }: { match: Match; myId: string; other: Profile; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getMessages(match.id).then(({ data }) => { if (data) setMessages(data as Message[]) })
    const sub = subscribeToMessages(match.id, (msg) => setMessages(prev => [...prev, msg]))
    return () => { supabase.removeChannel(sub) }
  }, [match.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!input.trim() && !previewFile) return
    if (previewFile) {
      setUploading(true)
      const path = `${myId}/${Date.now()}_${previewFile.name}`
      const { url } = await uploadMedia(previewFile, path)
      if (url) await sendMessage(match.id, myId, input || '', url, previewFile.type.startsWith('video') ? 'video' : 'image')
      setPreviewFile(null)
      setUploading(false)
    } else {
      await sendMessage(match.id, myId, input)
    }
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg }}>
      <style>{GCSS}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onBack} style={{ color: C.muted, fontSize: 20, lineHeight: 1 }}>←</button>
        <Avatar user={other} size={36} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{other.name}</div>
          <div style={{ fontSize: 11, color: other.online ? C.green : C.dim }}>{other.online ? 'Online' : 'Offline'}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, marginTop: 40 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>💬</div>
            Say something. Or don't. You matched for a reason.
          </div>
        )}
        {messages.map(msg => {
          const mine = msg.sender_id === myId
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '72%', background: mine ? C.accent : C.surf2, borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: msg.media_url ? '4px' : '10px 14px', overflow: 'hidden' }}>
                {msg.media_url && (
                  msg.media_type === 'video'
                    ? <video src={msg.media_url} controls style={{ width: '100%', borderRadius: 12, maxHeight: 220 }} />
                    : <img src={msg.media_url} style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover', display: 'block' }} alt="" />
                )}
                {msg.content && <div style={{ padding: msg.media_url ? '8px 10px 6px' : '0', fontSize: 14, lineHeight: 1.45 }}>{msg.content}</div>}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Preview */}
      {previewFile && (
        <div style={{ padding: '8px 14px', background: C.surf2, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: C.surf3, overflow: 'hidden' }}>
            {previewFile.type.startsWith('image') && <img src={URL.createObjectURL(previewFile)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
            {previewFile.type.startsWith('video') && <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎥</div>}
          </div>
          <div style={{ flex: 1, fontSize: 12, color: C.muted }}>{previewFile.name}</div>
          <button onClick={() => setPreviewFile(null)} style={{ color: C.dim, fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <input type="file" accept="image/*,video/*" ref={fileRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setPreviewFile(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} style={{ width: 40, height: 40, borderRadius: 10, background: C.surf2, color: C.muted, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📎</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Say something..." style={{ flex: 1, background: C.surf2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }} />
        <button onClick={send} disabled={uploading} style={{ width: 40, height: 40, borderRadius: 10, background: C.accent, color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploading ? 0.5 : 1 }}>
          {uploading ? '⏳' : '↑'}
        </button>
      </div>
    </div>
  )
}

// ─── Matches Screen ───────────────────────────────────────────────────────────
function MatchesScreen({ userId, onOpenChat }: { userId: string; onOpenChat: (match: Match, other: Profile) => void }) {
  const [matches, setMatches] = useState<any[]>([])

  useEffect(() => {
    getMatches(userId).then(({ data }) => { if (data) setMatches(data) })
  }, [userId])

  return (
    <div style={{ padding: 16 }}>
      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🤝</div>
          <div style={{ fontSize: 14 }}>No matches yet.</div>
          <div style={{ fontSize: 12, marginTop: 6, color: C.dim }}>Like someone on the map and if they like back, you match.</div>
        </div>
      ) : matches.map(m => {
        const other = m.user_a === userId ? m.user_b_profile : m.user_a_profile
        if (!other) return null
        return (
          <div key={m.id} onClick={() => onOpenChat(m, other)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
            <Avatar user={other} size={48} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{other.name}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Matched {new Date(m.created_at).toLocaleDateString()}</div>
            </div>
            <span style={{ color: C.muted, fontSize: 18 }}>›</span>
          </div>
        )
      })}
    </div>
  )
}


// ─── Photo Upload Step ────────────────────────────────────────────────────────
function PhotoUploadStep({ onPhoto, currentUrl, color, emoji }: { onPhoto: (url: string) => void; currentUrl: string | null; color: string; emoji: string }) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setErr('Max 10MB'); return }
    setUploading(true); setErr('')
    const path = `temp/${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`
    const { url, error } = await uploadMedia(file, path)
    if (error || !url) { setErr('Upload failed — try again'); setUploading(false); return }
    onPhoto(url)
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          width: 120, height: 120, borderRadius: '50%',
          background: `linear-gradient(135deg, ${color}33, ${color}11)`,
          border: `3px dashed ${currentUrl ? color : C.border2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.2s',
        }}>
        {uploading
          ? <div style={{ fontSize: 30 }}>⏳</div>
          : currentUrl
            ? <img src={currentUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            : <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36 }}>{emoji}</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Tap to add</div>
              </div>
        }
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFile} />
      {err && <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
      {currentUrl && <div style={{ color: C.green, fontSize: 13 }}>✓ Photo added</div>}
      <div style={{ color: C.dim, fontSize: 13 }}>Optional — you can add one later</div>
    </div>
  )
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function Onboarding({ onComplete }: { onComplete: (p: Partial<Profile>) => void }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ name: '', age: '', role: 'Versatile', bio: '', emoji: '🔥', color: C.accent, tags: [] as string[], photo_url: null as string | null })
  const [newTag, setNewTag] = useState('')

  const inputStyle: React.CSSProperties = { background: C.surf3, border: `1px solid ${C.border2}`, borderRadius: 12, padding: '13px 16px', color: C.text, fontSize: 15, width: '100%', outline: 'none' }

  const steps = [
    {
      title: "What do they call you?",
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name or handle" style={inputStyle} />
          <input value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="Age (18+)" type="number" style={inputStyle} />
        </div>
      ),
      valid: () => form.name.trim().length > 0 && Number(form.age) >= 18,
    },
    {
      title: "Your role?",
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ROLES.map(r => (
            <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))} style={{ padding: '14px', borderRadius: 12, background: form.role === r ? `${C.accent}22` : C.surf3, border: `1px solid ${form.role === r ? C.accent : C.border2}`, color: form.role === r ? C.accent : C.text, fontWeight: form.role === r ? 700 : 400, fontSize: 15, textAlign: 'left' }}>
              {r}
            </button>
          ))}
        </div>
      ),
      valid: () => true,
    },
    {
      title: "Pick your vibe",
      content: (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))} style={{ width: 52, height: 52, fontSize: 28, borderRadius: 12, background: form.emoji === e ? `${C.accent}22` : C.surf3, border: `2px solid ${form.emoji === e ? C.accent : 'transparent'}` }}>
                {e}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map(col => (
              <button key={col} onClick={() => setForm(f => ({ ...f, color: col }))} style={{ width: 36, height: 36, borderRadius: '50%', background: col, border: `3px solid ${form.color === col ? '#fff' : 'transparent'}` }} />
            ))}
          </div>
        </div>
      ),
      valid: () => true,
    },
    {
      title: "Add a photo",
      content: (
        <PhotoUploadStep onPhoto={(url) => setForm(f => ({ ...f, photo_url: url }))} currentUrl={form.photo_url} color={form.color} emoji={form.emoji} />
      ),
      valid: () => true,
    },
    {
      title: "Tell them something",
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Bio (optional)" rows={3} style={{ ...inputStyle, resize: 'none' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { setForm(f => ({ ...f, tags: [...f.tags, newTag.trim()] })); setNewTag('') } }} placeholder="Add tag (Enter)" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {form.tags.map(t => (
              <span key={t} onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} style={{ fontSize: 12, color: C.dim, background: C.surf3, padding: '4px 10px', borderRadius: 12, cursor: 'pointer' }}>{t} ✕</span>
            ))}
          </div>
        </div>
      ),
      valid: () => true,
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{GCSS}</style>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.accent : C.surf3, transition: 'background 0.3s' }} />
          ))}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>{steps[step].title}</div>
        {steps[step].content}
        <button
          onClick={() => { if (step < steps.length - 1) { if (steps[step].valid()) setStep(s => s + 1) } else onComplete({ ...form, age: Number(form.age) }) }}
          disabled={!steps[step].valid()}
          style={{ width: '100%', marginTop: 24, padding: '15px', borderRadius: 14, background: steps[step].valid() ? C.accent : C.surf3, color: steps[step].valid() ? '#fff' : C.dim, fontWeight: 700, fontSize: 16, transition: 'all 0.15s' }}>
          {step < steps.length - 1 ? 'Continue →' : 'Enter the Map'}
        </button>
      </div>
    </div>
  )
}

// ─── Map Screen ───────────────────────────────────────────────────────────────
function MapScreen({ myProfile, nearby, myPos, onMovePin, onSelectUser }: { myProfile: Partial<Profile>; nearby: (Profile & { isSeed?: boolean })[]; myPos: { x: number; y: number }; onMovePin: (p: { x: number; y: number }) => void; onSelectUser: (u: Profile & { isSeed?: boolean }) => void }) {
  // Lay out users at stable pseudo-random positions based on id
  const positions = nearby.map(u => {
    let hash = 0
    for (let i = 0; i < u.id.length; i++) hash = (hash * 31 + u.id.charCodeAt(i)) & 0xffff
    return { x: 10 + (hash % 80), y: 10 + ((hash >> 4) % 75) }
  })

  return (
    <div data-map="1" style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden', background: `radial-gradient(ellipse at center, #0d1a12 0%, ${C.bg} 100%)` }}>
      {/* Grid overlay */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04, pointerEvents: 'none' }}>
        <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22c55e" strokeWidth="0.5" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Nearby users */}
      {nearby.map((u, i) => (
        <div key={u.id} style={{ position: 'absolute', left: `${positions[i].x}%`, top: `${positions[i].y}%`, transform: 'translate(-50%,-50%)', cursor: 'pointer', zIndex: 10 }} onClick={() => onSelectUser(u)}>
          <Avatar user={u} size={44} />
          <div style={{ textAlign: 'center', fontSize: 10, color: C.muted, marginTop: 3, fontFamily: FONT, whiteSpace: 'nowrap' }}>{u.name}</div>
        </div>
      ))}

      {/* My pin */}
      <MyPin profile={myProfile} pos={myPos} onMove={onMovePin} />

      {/* Radar ring */}
      <div style={{ position: 'absolute', left: `${myPos.x}%`, top: `${myPos.y}%`, transform: 'translate(-50%,-50%)', width: 120, height: 120, borderRadius: '50%', border: `1px solid ${C.accent}30`, pointerEvents: 'none', zIndex: 5 }} />
      <div style={{ position: 'absolute', left: `${myPos.x}%`, top: `${myPos.y}%`, transform: 'translate(-50%,-50%)', width: 200, height: 200, borderRadius: '50%', border: `1px solid ${C.accent}15`, pointerEvents: 'none', zIndex: 5 }} />
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type Screen = 'map' | 'list' | 'matches' | 'profile'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [myProfile, setMyProfile] = useState<Partial<Profile> | null>(null)
  const [nearby, setNearby] = useState<(Profile & { isSeed?: boolean })[]>(SEEDS)
  const [myPos, setMyPos] = useState({ x: 50, y: 50 })
  const [screen, setScreen] = useState<Screen>('map')
  const [selectedUser, setSelectedUser] = useState<(Profile & { isSeed?: boolean }) | null>(null)
  const [activeMatch, setActiveMatch] = useState<{ match: Match; other: Profile } | null>(null)
  const [cruisingStatus, setCruisingStatus] = useState<string | null>(null)

  // Auth init
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load profile — localStorage cache first for instant render, then sync from Supabase
  useEffect(() => {
    const local = localStorage.getItem('he_local_profile')
    if (local) { try { setMyProfile(JSON.parse(local)) } catch {} }
  }, [])

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (error) console.error('Profile load error:', error)
      if (data) { setMyProfile(data); localStorage.setItem('he_local_profile', JSON.stringify(data)) }
    })
  }, [user])

  // Get location + nearby
  useEffect(() => {
    if (!user) return
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        getNearbyUsers(pos.coords.latitude, pos.coords.longitude).then(({ data }) => {
          if (data && data.length > 0) setNearby(data as Profile[])
        })
      }, () => setNearby(SEEDS))
    }
  }, [user])

  const handleOnboardingComplete = async (profileData: Partial<Profile>) => {
    let currentUser = user

    if (!currentUser) {
      const { data, error: authErr } = await signInAnon()
      if (authErr || !data.user) { console.error('Auth failed:', authErr); return }
      currentUser = data.user
      setUser(currentUser)
      await new Promise(res => setTimeout(res, 300))
    }

    const fullProfile = {
      id: currentUser.id,
      name: profileData.name ?? 'Anonymous',
      age: profileData.age ?? 18,
      role: profileData.role ?? 'Curious',
      bio: profileData.bio ?? '',
      emoji: profileData.emoji ?? '🔥',
      color: profileData.color ?? '#ff4d6d',
      tags: profileData.tags ?? [],
      is_anon: false,
      online: true,
      last_seen: new Date().toISOString(),
    }

    const { data, error } = await upsertProfile(fullProfile as Profile & { id: string })
    if (error) { console.error('Profile save failed:', error); setMyProfile(fullProfile); return }
    setMyProfile(data ?? fullProfile)
    localStorage.setItem('he_local_profile', JSON.stringify(data ?? fullProfile))
  }

  const handleLike = async (targetUser: Profile & { isSeed?: boolean }) => {
    if (!user || targetUser.isSeed) return
    await likeUser(user.id, targetUser.id)
  }

  const handleMessage = (_targetUser: Profile) => {
    // Find or create match — simplified: open matches screen
    setSelectedUser(null)
    setScreen('matches')
  }

  const handleMovePin = useCallback((pos: { x: number; y: number }) => {
    setMyPos(pos)
    if (myProfile) setMyProfile(p => ({ ...p, cruising_status: cruisingStatus }))
  }, [cruisingStatus, myProfile])

  if (activeMatch) {
    return <ChatScreen match={activeMatch.match} myId={user!.id} other={activeMatch.other} onBack={() => setActiveMatch(null)} />
  }

  if (!myProfile?.name) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  const TAB_H = 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 480, margin: '0 auto', height: '100vh', background: C.bg, fontFamily: SANS, position: 'relative', overflow: 'hidden' }}>
      <style>{GCSS}</style>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>THE HOLE EATERS</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {cruisingStatus ? (
            <button onClick={() => setCruisingStatus(null)} style={{ fontSize: 11, color: C.amber, background: `${C.amber}22`, padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
              {cruisingStatus} ✕
            </button>
          ) : (
            <select onChange={e => e.target.value && setCruisingStatus(e.target.value)} value="" style={{ background: C.surf2, border: `1px solid ${C.border2}`, color: C.dim, padding: '5px 8px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
              <option value="">Set status</option>
              {CRUISING.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <Avatar user={{ ...myProfile, online: true }} size={30} showStatus={false} />
        </div>
      </header>

      {/* Main content */}
      <main style={{ height: `calc(100vh - 52px - ${TAB_H}px)`, overflow: screen === 'map' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
        {screen === 'map' && (
          <MapScreen myProfile={{ ...myProfile, cruising_status: cruisingStatus }} nearby={nearby} myPos={myPos} onMovePin={handleMovePin} onSelectUser={setSelectedUser} />
        )}
        {screen === 'list' && (
          <div>
            {nearby.map(u => (
              <div key={u.id} onClick={() => setSelectedUser(u)} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <Avatar user={u} size={50} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>{u.name}</span>
                    <span style={{ color: C.muted, fontSize: 13 }}>{u.age}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: u.color, background: `${u.color}22`, padding: '2px 8px', borderRadius: 10 }}>{u.role}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 3 }}>{u.bio || 'No bio'}</div>
                  {u.cruising_status && <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>📍 {u.cruising_status}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {screen === 'matches' && user && (
          <MatchesScreen userId={user.id} onOpenChat={(match, other) => setActiveMatch({ match, other })} />
        )}
        {screen === 'profile' && (
          <div style={{ padding: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Avatar user={{ ...myProfile, online: true }} size={80} />
              <div style={{ fontWeight: 800, fontSize: 22, marginTop: 12 }}>{myProfile.name}</div>
              <div style={{ color: C.muted, fontSize: 14 }}>{myProfile.role} · {myProfile.age}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CRUISING.map(s => (
                <button key={s} onClick={() => setCruisingStatus(cruisingStatus === s ? null : s)} style={{ padding: '12px 16px', borderRadius: 12, background: cruisingStatus === s ? `${C.amber}22` : C.surf2, border: `1px solid ${cruisingStatus === s ? C.amber : C.border}`, color: cruisingStatus === s ? C.amber : C.text, fontWeight: cruisingStatus === s ? 700 : 400, textAlign: 'left', fontSize: 14 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, height: TAB_H, background: C.surface, borderTop: `1px solid ${C.border}`, display: 'flex', zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {([
          { id: 'map', label: 'Map', icon: '📍' },
          { id: 'list', label: 'Nearby', icon: '👥' },
          { id: 'matches', label: 'Matches', icon: '❤️' },
          { id: 'profile', label: 'Me', icon: '👤' },
        ] as { id: Screen; label: string; icon: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setScreen(tab.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: screen === tab.id ? C.accent : C.dim, fontSize: screen === tab.id ? 21 : 20, background: 'none', transition: 'color 0.15s' }}>
            <span>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: screen === tab.id ? 700 : 400 }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      <InstallBanner />

      {/* Profile drawer */}
      {selectedUser && (
        <ProfileDrawer user={selectedUser as Profile & { isSeed?: boolean }} myId={user?.id ?? ''} onClose={() => setSelectedUser(null)} onLike={() => handleLike(selectedUser as Profile & { isSeed?: boolean })} onMessage={() => handleMessage(selectedUser as Profile)} />
      )}
    </div>
  )
}
