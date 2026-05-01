import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, signInAnon, upsertProfile, getNearbyUsers, likeUser, getMatches, getMessages, sendMessage, subscribeToMessages, uploadMedia, submitReport, getGlobalMessages, sendGlobalMessage, subscribeToGlobalChat } from './lib/supabase'
import type { Profile, Match, Message, ReportReason, GlobalMessage } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#08090d', surface: '#0f1018', surf2: '#161821', surf3: '#1d1f2b',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.1)',
  text: '#f0f0f5', dim: '#6b6d7d', muted: '#9497aa',
  accent: '#ff4d6d', green: '#22c55e', blue: '#4d79ff', amber: '#eab308',
  purple: '#a855f7', orange: '#f97316', ghost: '#64ffda', pulse: '#ff4d6d',
}
const FONT = "'DM Mono', 'Fira Code', monospace"
const SANS = "'DM Sans', system-ui, sans-serif"
const ROLES = ['Top', 'Bottom', 'Versatile', 'Curious', 'Host']
const EMOJIS = ['🔥', '🐷', '🐻', '😈', '💦', '👅', '⛓️', '🌈']
const COLORS = [C.accent, C.purple, C.orange, '#ec4899', '#06b6d4', '#10b981']
const CRUISING = ['Hosting now', 'In my car', 'Come find me', 'Down for whatever', 'Just looking']
const PULSE_TTL = 60 * 60 * 1000 // 60 min

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: ${SANS}; -webkit-font-smoothing: antialiased; }
  button { cursor: pointer; border: none; background: none; color: inherit; font-family: inherit; }
  input, textarea, select { font-family: inherit; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes ping { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2.5);opacity:0} }
  @keyframes ghostFloat { 0%,100%{transform:translate(-50%,-50%) translateY(0)} 50%{transform:translate(-50%,-50%) translateY(-5px)} }
  @keyframes pulseBeacon {
    0% { transform: translate(-50%,-50%) scale(1); opacity: 0.8; }
    100% { transform: translate(-50%,-50%) scale(3); opacity: 0; }
  }
  @keyframes roomGlow { 0%,100%{box-shadow:0 0 0 0 rgba(255,77,109,0.5)} 50%{box-shadow:0 0 0 10px rgba(255,77,109,0)} }
  @keyframes countdownShrink { from{width:100%} to{width:0%} }
  @keyframes slideDown { from{transform:translateY(-20px);opacity:0} to{transform:translateY(0);opacity:1} }
`

// ─── Types ────────────────────────────────────────────────────────────────────
interface PulseMsg { id: string; senderId: string; senderName: string; senderEmoji: string; senderColor: string; content: string; ts: number }
interface PulseRoom { id: string; name: string; creatorId: string; creatorName: string; memberIds: string[]; messages: PulseMsg[]; expiresAt: number; pulseColor: string }

// ─── Seed Profiles ────────────────────────────────────────────────────────────
const SEEDS: (Profile & { isSeed: true })[] = [
  { id: 's1', name: 'RawDog69', age: 34, emoji: '🔥', color: C.accent, role: 'Top', bio: 'No labels.', online: true, is_anon: false, tags: ['raw','nsfw'], cruising_status: 'Come find me', photo_url: null, video_url: null, last_seen: '', isSeed: true },
  { id: 's2', name: 'PigBottom88', age: 28, emoji: '🐷', color: C.purple, role: 'Bottom', bio: 'Use me.', online: true, is_anon: false, tags: ['sub','fetish'], cruising_status: 'Hosting now', photo_url: null, video_url: null, last_seen: '', isSeed: true },
  { id: 's3', name: 'DaddyBear', age: 47, emoji: '🐻', color: C.orange, role: 'Versatile', bio: 'Growl.', online: false, is_anon: false, tags: ['bear','dom'], cruising_status: null, photo_url: null, video_url: null, last_seen: '', isSeed: true },
  { id: 's4', name: 'CuriousCub', age: 23, emoji: '😈', color: '#10b981', role: 'Curious', bio: 'First time exploring.', online: true, is_anon: false, tags: ['curious'], cruising_status: 'Just looking', photo_url: null, video_url: null, last_seen: '', isSeed: true },
]

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ user, size = 44, showStatus = true, ghost = false }: { user: Partial<Profile>; size?: number; showStatus?: boolean; ghost?: boolean }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: ghost ? 'rgba(100,255,218,0.06)' : `linear-gradient(135deg, ${user.color}88, ${user.color}22)`,
        border: `2px solid ${ghost ? C.ghost + '66' : user.color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', fontSize: size * 0.45,
        filter: ghost ? 'grayscale(0.8) brightness(0.5)' : 'none',
      }}>
        {ghost ? '👻' : (user.photo_url ? <img src={user.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : user.emoji)}
      </div>
      {showStatus && user.online && !ghost && (
        <div style={{ position: 'absolute', bottom: 1, right: 1, width: size * 0.26, height: size * 0.26, background: C.green, borderRadius: '50%', border: `2px solid ${C.bg}` }} />
      )}
      {ghost && showStatus && (
        <div style={{ position: 'absolute', bottom: 1, right: 1, width: size * 0.26, height: size * 0.26, background: C.ghost, borderRadius: '50%', border: `2px solid ${C.bg}`, animation: 'pulse 1.5s infinite' }} />
      )}
    </div>
  )
}

// ─── My Pin ───────────────────────────────────────────────────────────────────
function MyPin({ profile, pos, onMove, isGhost }: { profile: Partial<Profile>; pos: { x: number; y: number }; onMove: (p: { x: number; y: number }) => void; isGhost: boolean }) {
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

  if (isGhost) return (
    <div style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, animation: 'ghostFloat 3s ease-in-out infinite', zIndex: 100 }}>
      <div onPointerDown={onPointerDown} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(100,255,218,0.05)', border: `2px dashed ${C.ghost}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>👻</div>
      </div>
      <div style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: C.ghost, fontFamily: FONT, whiteSpace: 'nowrap', opacity: 0.6 }}>ghost mode</div>
    </div>
  )

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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: C.surf2, borderRadius: '20px 20px 0 0', padding: '0 0 32px', animation: 'slideUp 0.25s ease', maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ height: 180, background: `linear-gradient(135deg, ${user.color}33, ${user.color}11)`, position: 'relative', borderRadius: '20px 20px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar user={user} size={80} />
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', color: C.text, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          {user.cruising_status && <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: C.amber, color: '#000', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{user.cruising_status}</div>}
        </div>
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {user.tags.map(tag => <span key={tag} style={{ fontSize: 11, color: C.dim, background: C.surf3, padding: '3px 9px', borderRadius: 12, fontFamily: FONT }}>{tag}</span>)}
                </div>
              )}
            </div>
          )}
          {tab === 'vibe' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🔮</div>
              <p style={{ color: C.muted, fontSize: 14 }}>Vibe check coming soon.</p>
            </div>
          )}
          {tab === 'report' && (
            <div style={{ padding: '4px 0' }}>
              {reportSent ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}><div style={{ fontSize: 36, marginBottom: 8 }}>✅</div><p style={{ fontWeight: 700 }}>Report submitted</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, color: C.muted }}>Why are you reporting {user.name}?</div>
                  <select value={reportReason} onChange={e => setReportReason(e.target.value as ReportReason)} style={{ background: C.surf3, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }}>
                    <option value="fake_profile">Fake Profile</option>
                    <option value="harassment">Harassment</option>
                    <option value="underage">Underage</option>
                    <option value="spam">Spam</option>
                    <option value="inappropriate_photo">Inappropriate Photo</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder="Additional details (optional)" rows={3} style={{ background: C.surf3, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none', resize: 'none' }} />
                  <button onClick={async () => { if (!myId || user.isSeed) return; await submitReport(myId, user.id, reportReason, reportDetails); setReportSent(true) }} style={{ padding: '12px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontWeight: 700, fontSize: 14 }}>Submit Report</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '8px 20px 0' }}>
          <button onClick={() => { setLiked(true); onLike() }} style={{ flex: 1, padding: '13px', borderRadius: 12, background: liked ? `${C.accent}33` : C.surf3, border: `1px solid ${liked ? C.accent : C.border2}`, color: liked ? C.accent : C.text, fontWeight: 700, fontSize: 14 }}>
            {liked ? '❤️ Liked' : '🤙 Like'}
          </button>
          {!user.isSeed && (
            <button onClick={onMessage} style={{ flex: 1, padding: '13px', borderRadius: 12, background: C.surf3, border: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 14 }}>💬 Message</button>
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
      setPreviewFile(null); setUploading(false)
    } else {
      await sendMessage(match.id, myId, input)
    }
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg }}>
      <style>{GCSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onBack} style={{ color: C.muted, fontSize: 20 }}>←</button>
        <Avatar user={other} size={36} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{other.name}</div>
          <div style={{ fontSize: 11, color: other.online ? C.green : C.dim }}>{other.online ? 'Online' : 'Offline'}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, marginTop: 40 }}><div style={{ fontSize: 30, marginBottom: 8 }}>💬</div>Say something. You matched for a reason.</div>}
        {messages.map(msg => {
          const mine = msg.sender_id === myId
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '72%', background: mine ? C.accent : C.surf2, borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: msg.media_url ? '4px' : '10px 14px', overflow: 'hidden' }}>
                {msg.media_url && (msg.media_type === 'video' ? <video src={msg.media_url} controls style={{ width: '100%', borderRadius: 12, maxHeight: 220 }} /> : <img src={msg.media_url} style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover', display: 'block' }} alt="" />)}
                {msg.content && <div style={{ padding: msg.media_url ? '8px 10px 6px' : '0', fontSize: 14, lineHeight: 1.45 }}>{msg.content}</div>}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {previewFile && (
        <div style={{ padding: '8px 14px', background: C.surf2, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: C.surf3, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {previewFile.type.startsWith('image') ? <img src={URL.createObjectURL(previewFile)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 20 }}>🎥</span>}
          </div>
          <div style={{ flex: 1, fontSize: 12, color: C.muted }}>{previewFile.name}</div>
          <button onClick={() => setPreviewFile(null)} style={{ color: C.dim, fontSize: 16 }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <input type="file" accept="image/*,video/*" ref={fileRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setPreviewFile(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} style={{ width: 40, height: 40, borderRadius: 10, background: C.surf2, color: C.muted, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📎</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} placeholder="Say something..." style={{ flex: 1, background: C.surf2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }} />
        <button onClick={send} disabled={uploading} style={{ width: 40, height: 40, borderRadius: 10, background: C.accent, color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploading ? 0.5 : 1 }}>{uploading ? '⏳' : '↑'}</button>
      </div>
    </div>
  )
}

// ─── Matches Screen ───────────────────────────────────────────────────────────
function MatchesScreen({ userId, onOpenChat }: { userId: string; onOpenChat: (match: Match, other: Profile) => void }) {
  const [matches, setMatches] = useState<any[]>([])
  useEffect(() => { getMatches(userId).then(({ data }) => { if (data) setMatches(data) }) }, [userId])

  return (
    <div style={{ padding: 16 }}>
      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🤝</div>
          <div style={{ fontSize: 14 }}>No matches yet.</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Like someone on the map and if they like back, you match.</div>
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
    if (error || !url) { setErr('Upload failed'); setUploading(false); return }
    onPhoto(url); setUploading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div onClick={() => !uploading && fileRef.current?.click()} style={{ width: 120, height: 120, borderRadius: '50%', background: `linear-gradient(135deg, ${color}33, ${color}11)`, border: `3px dashed ${currentUrl ? color : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
        {uploading ? <div style={{ fontSize: 30 }}>⏳</div> : currentUrl ? <img src={currentUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 36 }}>{emoji}</div><div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Tap to add</div></div>}
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
    { title: "What do they call you?", content: (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name or handle" style={inputStyle} /><input value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="Age (18+)" type="number" style={inputStyle} /></div>), valid: () => form.name.trim().length > 0 && Number(form.age) >= 18 },
    { title: "Your role?", content: (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{ROLES.map(r => (<button key={r} onClick={() => setForm(f => ({ ...f, role: r }))} style={{ padding: '14px', borderRadius: 12, background: form.role === r ? `${C.accent}22` : C.surf3, border: `1px solid ${form.role === r ? C.accent : C.border2}`, color: form.role === r ? C.accent : C.text, fontWeight: form.role === r ? 700 : 400, fontSize: 15, textAlign: 'left' }}>{r}</button>))}</div>), valid: () => true },
    { title: "Pick your vibe", content: (<div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>{EMOJIS.map(e => (<button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))} style={{ width: 52, height: 52, fontSize: 28, borderRadius: 12, background: form.emoji === e ? `${C.accent}22` : C.surf3, border: `2px solid ${form.emoji === e ? C.accent : 'transparent'}` }}>{e}</button>))}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{COLORS.map(col => (<button key={col} onClick={() => setForm(f => ({ ...f, color: col }))} style={{ width: 36, height: 36, borderRadius: '50%', background: col, border: `3px solid ${form.color === col ? '#fff' : 'transparent'}` }} />))}</div></div>), valid: () => true },
    { title: "Add a photo", content: (<PhotoUploadStep onPhoto={(url) => setForm(f => ({ ...f, photo_url: url }))} currentUrl={form.photo_url} color={form.color} emoji={form.emoji} />), valid: () => true },
    { title: "Tell them something", content: (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Bio (optional)" rows={3} style={{ ...inputStyle, resize: 'none' }} /><input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { setForm(f => ({ ...f, tags: [...f.tags, newTag.trim()] })); setNewTag('') } }} placeholder="Add tag (Enter)" style={{ ...inputStyle }} /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{form.tags.map(t => (<span key={t} onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} style={{ fontSize: 12, color: C.dim, background: C.surf3, padding: '4px 10px', borderRadius: 12, cursor: 'pointer' }}>{t} ✕</span>))}</div></div>), valid: () => true },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{GCSS}</style>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>{steps.map((_, i) => (<div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.accent : C.surf3, transition: 'background 0.3s' }} />))}</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>{steps[step].title}</div>
        {steps[step].content}
        <button onClick={() => { if (step < steps.length - 1) { if (steps[step].valid()) setStep(s => s + 1) } else onComplete({ ...form, age: Number(form.age) }) }} disabled={!steps[step].valid()} style={{ width: '100%', marginTop: 24, padding: '15px', borderRadius: 14, background: steps[step].valid() ? C.accent : C.surf3, color: steps[step].valid() ? '#fff' : C.dim, fontWeight: 700, fontSize: 16, transition: 'all 0.15s' }}>
          {step < steps.length - 1 ? 'Continue →' : 'Enter the Map'}
        </button>
      </div>
    </div>
  )
}

// ─── FEATURE: PULSE ROOM ──────────────────────────────────────────────────────
function PulseRoomOverlay({ room, myProfile, onClose, onSend }: { room: PulseRoom; myProfile: Partial<Profile>; onClose: () => void; onSend: (text: string) => void }) {
  const [input, setInput] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => setTimeLeft(Math.max(0, room.expiresAt - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [room.expiresAt])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [room.messages.length])

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const pct = Math.max(0, (timeLeft / PULSE_TTL) * 100)

  const send = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: C.surf2, borderRadius: '24px 24px 0 0', animation: 'slideUp 0.3s ease', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
        {/* Countdown bar */}
        <div style={{ height: 3, background: C.surf3, borderRadius: '24px 24px 0 0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`, transition: 'width 1s linear' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent, animation: 'pulse 1s infinite' }} />
            <div style={{ fontWeight: 800, fontSize: 15 }}>{room.name}</div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: timeLeft < 300000 ? '#ef4444' : C.dim, fontFamily: FONT }}>⏱ {fmt(timeLeft)}</span>
              <button onClick={onClose} style={{ color: C.dim, fontSize: 16, marginLeft: 4 }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {room.memberIds.length} in room · auto-deletes when timer ends · location-only
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200 }}>
          {room.messages.length === 0 && (
            <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, paddingTop: 30 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📡</div>
              Room is live. Say something.
            </div>
          )}
          {room.messages.map(msg => {
            const mine = msg.senderId === myProfile.id
            return (
              <div key={msg.id} style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${msg.senderColor}22`, border: `1.5px solid ${msg.senderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{msg.senderEmoji}</div>
                <div style={{ maxWidth: '70%' }}>
                  {!mine && <div style={{ fontSize: 10, color: msg.senderColor, marginBottom: 2, marginLeft: 2, fontWeight: 700 }}>{msg.senderName}</div>}
                  <div style={{ background: mine ? C.accent : C.surf3, borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '9px 13px', fontSize: 14, lineHeight: 1.4 }}>{msg.content}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message the room..." style={{ flex: 1, background: C.surf3, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }} />
          <button onClick={send} disabled={!input.trim()} style={{ width: 40, height: 40, borderRadius: 10, background: input.trim() ? C.accent : C.surf3, color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>↑</button>
        </div>
      </div>
    </div>
  )
}

// ─── FEATURE: GHOST MODE BANNER ───────────────────────────────────────────────
function GhostBanner({ onDisable }: { onDisable: () => void }) {
  return (
    <div style={{ position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, zIndex: 250, padding: '0 12px', animation: 'slideDown 0.3s ease' }}>
      <div style={{ background: 'rgba(100,255,218,0.06)', border: `1px solid ${C.ghost}33`, borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(8px)' }}>
        <span style={{ fontSize: 18 }}>👻</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.ghost }}>Ghost Mode Active</div>
          <div style={{ fontSize: 11, color: C.dim }}>You're invisible on the map. Chatting as 👻 Ghost.</div>
        </div>
        <button onClick={onDisable} style={{ fontSize: 11, color: C.ghost, border: `1px solid ${C.ghost}44`, borderRadius: 8, padding: '5px 10px', fontWeight: 700 }}>Reveal</button>
      </div>
    </div>
  )
}

// ─── Map Screen ───────────────────────────────────────────────────────────────
function MapScreen({ myProfile, nearby, myPos, onMovePin, onSelectUser, isGhost, onOpenPulseRoom, pulseRooms, onCreatePulseRoom }: {
  myProfile: Partial<Profile>; nearby: (Profile & { isSeed?: boolean })[]; myPos: { x: number; y: number };
  onMovePin: (p: { x: number; y: number }) => void; onSelectUser: (u: Profile & { isSeed?: boolean }) => void;
  isGhost: boolean; onOpenPulseRoom: (id: string) => void;
  pulseRooms: PulseRoom[]; onCreatePulseRoom: () => void;
}) {
  const positions = nearby.map(u => {
    let hash = 0
    for (let i = 0; i < u.id.length; i++) hash = (hash * 31 + u.id.charCodeAt(i)) & 0xffff
    return { x: 10 + (hash % 80), y: 10 + ((hash >> 4) % 75) }
  })

  const onlineCount = nearby.filter(u => u.online).length

  return (
    <div data-map="1" style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden', background: `radial-gradient(ellipse at center, #0d1a12 0%, ${C.bg} 100%)` }}>
      {/* Grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04, pointerEvents: 'none' }}>
        <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22c55e" strokeWidth="0.5" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Ghost overlay */}
      {isGhost && (
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(100,255,218,0.01) 20px, rgba(100,255,218,0.01) 40px)', pointerEvents: 'none', zIndex: 1 }} />
      )}

      {/* Nearby users — hidden from ghost's map (they still see everyone) */}
      {nearby.map((u, i) => (
        <div key={u.id} style={{ position: 'absolute', left: `${positions[i].x}%`, top: `${positions[i].y}%`, transform: 'translate(-50%,-50%)', cursor: 'pointer', zIndex: 10 }} onClick={() => onSelectUser(u)}>
          <Avatar user={u} size={44} />
          <div style={{ textAlign: 'center', fontSize: 10, color: C.muted, marginTop: 3, fontFamily: FONT, whiteSpace: 'nowrap' }}>{u.name}</div>
        </div>
      ))}

      {/* Pulse Room beacons */}
      {pulseRooms.map((room, i) => {
        const bx = 20 + (i * 30) % 60
        const by = 30 + (i * 20) % 40
        const isExpired = Date.now() > room.expiresAt
        if (isExpired) return null
        return (
          <div key={room.id} style={{ position: 'absolute', left: `${bx}%`, top: `${by}%`, transform: 'translate(-50%,-50%)', zIndex: 20, cursor: 'pointer' }} onClick={() => onOpenPulseRoom(room.id)}>
            {/* Ring animations */}
            <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', border: `2px solid ${room.pulseColor}`, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', animation: 'pulseBeacon 2s ease-out infinite' }} />
            <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', border: `2px solid ${room.pulseColor}`, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', animation: 'pulseBeacon 2s ease-out infinite 0.6s' }} />
            {/* Core */}
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${room.pulseColor}22`, border: `2px solid ${room.pulseColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, animation: 'roomGlow 2s infinite' }}>📡</div>
            <div style={{ textAlign: 'center', fontSize: 9, color: room.pulseColor, marginTop: 4, fontFamily: FONT, fontWeight: 700, whiteSpace: 'nowrap' }}>{room.name}</div>
            <div style={{ textAlign: 'center', fontSize: 9, color: C.dim, marginTop: 1, fontFamily: FONT }}>{room.memberIds.length} in room</div>
          </div>
        )
      })}

      {/* My pin */}
      <MyPin profile={myProfile} pos={myPos} onMove={onMovePin} isGhost={isGhost} />

      {/* Radar rings */}
      <div style={{ position: 'absolute', left: `${myPos.x}%`, top: `${myPos.y}%`, transform: 'translate(-50%,-50%)', width: 120, height: 120, borderRadius: '50%', border: `1px solid ${isGhost ? C.ghost + '20' : C.accent + '30'}`, pointerEvents: 'none', zIndex: 5 }} />
      <div style={{ position: 'absolute', left: `${myPos.x}%`, top: `${myPos.y}%`, transform: 'translate(-50%,-50%)', width: 200, height: 200, borderRadius: '50%', border: `1px solid ${isGhost ? C.ghost + '10' : C.accent + '15'}`, pointerEvents: 'none', zIndex: 5 }} />

      {/* Online count */}
      <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: `1px solid ${C.border2}`, borderRadius: 20, padding: '5px 12px', fontSize: 11, color: C.green, fontFamily: FONT, zIndex: 30 }}>
        ● {onlineCount} online
      </div>

      {/* Create Pulse Room FAB */}
      {!isGhost && (
        <button onClick={onCreatePulseRoom} style={{ position: 'absolute', bottom: 16, right: 14, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, border: 'none', borderRadius: 16, padding: '10px 16px', color: '#fff', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, boxShadow: `0 4px 20px ${C.accent}44`, zIndex: 30 }}>
          <span style={{ fontSize: 16 }}>📡</span> Start Pulse Room
        </button>
      )}
    </div>
  )
}

// ─── Whore-izon Global Chat ───────────────────────────────────────────────────
function GlobalChat({ userId, isGhost }: { userId: string | null; isGhost: boolean }) {
  const [messages, setMessages] = useState<GlobalMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getGlobalMessages(60).then(({ data }) => { if (data) setMessages(data as GlobalMessage[]) })
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('online', true).then(({ count }) => setOnlineCount(count ?? 0))
    const sub = subscribeToGlobalChat((msg) => setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
    return () => { supabase.removeChannel(sub) }
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || !userId || sending) return
    setSending(true); setInput('')

    // Ghost sends as anonymous
    if (isGhost) {
      const ghostMsg: GlobalMessage = {
        id: `ghost_${Date.now()}`,
        sender_id: userId,
        content: text,
        created_at: new Date().toISOString(),
        media_url: null,
        media_type: null,
        sender: { name: '👻 Ghost', emoji: '👻', color: C.ghost, photo_url: null } as any,
      }
      setMessages(prev => [...prev, ghostMsg])
      // Still persist but anonymized
      await sendGlobalMessage(userId, `👻 ${text}`)
      setSending(false)
      inputRef.current?.focus()
      return
    }

    const { data, error } = await sendGlobalMessage(userId, text)
    if (error) { setInput(text) } else if (data) setMessages(prev => prev.some(m => m.id === (data as any).id) ? prev : [...prev, data as GlobalMessage])
    setSending(false)
    inputRef.current?.focus()
  }

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Whore-izon</div>
          <div style={{ fontSize: 11, color: C.green, marginTop: 1 }}>● {onlineCount} online {isGhost && <span style={{ color: C.ghost }}> · you're a ghost</span>}</div>
        </div>
        {isGhost && <div style={{ fontSize: 20 }}>👻</div>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, paddingTop: 40 }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔥</div>No messages yet. Start it.</div>}
        {messages.map((msg, i) => {
          const mine = msg.sender_id === userId
          const sender = msg.sender
          const prevMsg = messages[i - 1]
          const showHeader = !prevMsg || prevMsg.sender_id !== msg.sender_id
          const isGhostMsg = msg.content.startsWith('👻 ')
          const displayContent = isGhostMsg ? msg.content.slice(2) : msg.content

          return (
            <div key={msg.id} style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              <div style={{ width: 28, flexShrink: 0 }}>
                {showHeader && !mine && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: isGhostMsg ? 'rgba(100,255,218,0.06)' : `${sender?.color ?? C.accent}22`, border: `1.5px solid ${isGhostMsg ? C.ghost + '44' : sender?.color ?? C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, overflow: 'hidden' }}>
                    {isGhostMsg ? '👻' : (sender?.photo_url ? <img src={sender.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : sender?.emoji ?? '👤')}
                  </div>
                )}
              </div>
              <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {showHeader && !mine && <div style={{ fontSize: 11, color: isGhostMsg ? C.ghost : (sender?.color ?? C.muted), fontWeight: 700, marginLeft: 2 }}>{isGhostMsg ? '👻 Ghost' : (sender?.name ?? 'Anonymous')}</div>}
                <div style={{ background: mine ? C.accent : isGhostMsg ? 'rgba(100,255,218,0.08)' : C.surf2, borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '9px 13px', fontSize: 14, lineHeight: 1.4, border: isGhostMsg ? `1px solid ${C.ghost}22` : 'none', color: isGhostMsg ? C.ghost : C.text }}>
                  {displayContent}
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginLeft: 2, marginRight: 2 }}>{fmt(msg.created_at)}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {userId ? (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: C.surface, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          {isGhost && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, fontSize: 18, flexShrink: 0, borderRadius: 10, background: 'rgba(100,255,218,0.06)', border: `1px solid ${C.ghost}33` }}>👻</div>}
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} placeholder={isGhost ? "Message as Ghost..." : "Say something..."} maxLength={500} style={{ flex: 1, background: isGhost ? 'rgba(100,255,218,0.04)' : C.surf2, border: `1px solid ${isGhost ? C.ghost + '33' : C.border2}`, borderRadius: 10, padding: '10px 14px', color: isGhost ? C.ghost : C.text, fontSize: 14, outline: 'none' }} />
          <button onClick={send} disabled={!input.trim() || sending} style={{ width: 40, height: 40, borderRadius: 10, background: input.trim() ? (isGhost ? C.ghost : C.accent) : C.surf3, color: isGhost ? C.bg : '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: sending ? 0.6 : 1, transition: 'all 0.15s' }}>↑</button>
        </div>
      ) : (
        <div style={{ padding: '14px 16px', background: C.surface, borderTop: `1px solid ${C.border}`, textAlign: 'center', color: C.dim, fontSize: 13 }}>Complete onboarding to chat</div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type Screen = 'map' | 'list' | 'matches' | 'global' | 'profile'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [myProfile, setMyProfile] = useState<Partial<Profile> | null>(null)
  const [nearby, setNearby] = useState<(Profile & { isSeed?: boolean })[]>(SEEDS)
  const [myPos, setMyPos] = useState({ x: 50, y: 50 })
  const [screen, setScreen] = useState<Screen>('map')
  const [selectedUser, setSelectedUser] = useState<(Profile & { isSeed?: boolean }) | null>(null)
  const [activeMatch, setActiveMatch] = useState<{ match: Match; other: Profile } | null>(null)
  const [cruisingStatus, setCruisingStatus] = useState<string | null>(null)

  // ── Ghost Mode ──
  const [isGhost, setIsGhost] = useState(false)

  // ── Pulse Rooms (localStorage-backed, ephemeral) ──
  const [pulseRooms, setPulseRooms] = useState<PulseRoom[]>(() => {
    try {
      const saved = localStorage.getItem('he_pulse_rooms')
      if (saved) {
        const rooms: PulseRoom[] = JSON.parse(saved)
        return rooms.filter(r => Date.now() < r.expiresAt)
      }
    } catch {}
    return []
  })
  const [activePulseRoom, setActivePulseRoom] = useState<PulseRoom | null>(null)

  const savePulseRooms = (rooms: PulseRoom[]) => {
    const live = rooms.filter(r => Date.now() < r.expiresAt)
    localStorage.setItem('he_pulse_rooms', JSON.stringify(live))
    setPulseRooms(live)
  }

  // Purge expired rooms every 30s
  useEffect(() => {
    const id = setInterval(() => {
      setPulseRooms(prev => {
        const live = prev.filter(r => Date.now() < r.expiresAt)
        if (live.length !== prev.length) localStorage.setItem('he_pulse_rooms', JSON.stringify(live))
        return live
      })
      if (activePulseRoom && Date.now() > activePulseRoom.expiresAt) setActivePulseRoom(null)
    }, 30000)
    return () => clearInterval(id)
  }, [activePulseRoom])

  const handleCreatePulseRoom = () => {
    if (!myProfile?.name) return
    const roomColors = [C.accent, C.purple, C.orange, '#06b6d4', '#10b981']
    const newRoom: PulseRoom = {
      id: `room_${Date.now()}`,
      name: `${myProfile.name}'s Room`,
      creatorId: user?.id ?? 'anon',
      creatorName: myProfile.name ?? 'Anonymous',
      memberIds: [user?.id ?? 'anon'],
      messages: [],
      expiresAt: Date.now() + PULSE_TTL,
      pulseColor: roomColors[Math.floor(Math.random() * roomColors.length)],
    }
    const updated = [...pulseRooms, newRoom]
    savePulseRooms(updated)
    setActivePulseRoom(newRoom)
  }

  const handleOpenPulseRoom = (id: string) => {
    const room = pulseRooms.find(r => r.id === id)
    if (room) {
      // Add self as member
      if (!room.memberIds.includes(user?.id ?? 'anon')) {
        const updated = pulseRooms.map(r => r.id === id ? { ...r, memberIds: [...r.memberIds, user?.id ?? 'anon'] } : r)
        savePulseRooms(updated)
        setActivePulseRoom({ ...room, memberIds: [...room.memberIds, user?.id ?? 'anon'] })
      } else {
        setActivePulseRoom(room)
      }
    }
  }

  const handlePulseSend = (text: string) => {
    if (!activePulseRoom || !myProfile) return
    const msg: PulseMsg = {
      id: `msg_${Date.now()}`,
      senderId: user?.id ?? 'anon',
      senderName: myProfile.name ?? 'Anonymous',
      senderEmoji: myProfile.emoji ?? '🔥',
      senderColor: myProfile.color ?? C.accent,
      content: text,
      ts: Date.now(),
    }
    const updated = pulseRooms.map(r => r.id === activePulseRoom.id ? { ...r, messages: [...r.messages, msg] } : r)
    savePulseRooms(updated)
    setActivePulseRoom(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : prev)
  }

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const local = localStorage.getItem('he_local_profile')
    if (local) { try { setMyProfile(JSON.parse(local)) } catch {} }
  }, [])

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data) { setMyProfile(data); localStorage.setItem('he_local_profile', JSON.stringify(data)) }
    })
  }, [user])

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
      if (authErr || !data.user) return
      currentUser = data.user; setUser(currentUser)
      await new Promise(res => setTimeout(res, 300))
    }
    const fullProfile = { id: currentUser.id, name: profileData.name ?? 'Anonymous', age: profileData.age ?? 18, role: profileData.role ?? 'Curious', bio: profileData.bio ?? '', emoji: profileData.emoji ?? '🔥', color: profileData.color ?? C.accent, tags: profileData.tags ?? [], is_anon: false, online: true, last_seen: new Date().toISOString() }
    const { data, error } = await upsertProfile(fullProfile as Profile & { id: string })
    if (error) { setMyProfile(fullProfile); return }
    setMyProfile(data ?? fullProfile)
    localStorage.setItem('he_local_profile', JSON.stringify(data ?? fullProfile))
  }

  const handleMovePin = useCallback((pos: { x: number; y: number }) => { setMyPos(pos) }, [])

  if (activeMatch) return <ChatScreen match={activeMatch.match} myId={user!.id} other={activeMatch.other} onBack={() => setActiveMatch(null)} />
  if (!myProfile?.name) return <Onboarding onComplete={handleOnboardingComplete} />

  const TAB_H = 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 480, margin: '0 auto', height: '100vh', background: C.bg, fontFamily: SANS, position: 'relative', overflow: 'hidden' }}>
      <style>{GCSS}</style>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, zIndex: 200 }}>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>THE HOLE EATERS</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Ghost Mode Toggle */}
          <button onClick={() => setIsGhost(g => !g)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: isGhost ? 'rgba(100,255,218,0.1)' : C.surf2, border: `1px solid ${isGhost ? C.ghost + '55' : C.border2}`, fontSize: 11, fontWeight: 700, color: isGhost ? C.ghost : C.dim, transition: 'all 0.2s' }}>
            <span>👻</span>
            <span>{isGhost ? 'Ghost' : 'Go Ghost'}</span>
          </button>

          {cruisingStatus ? (
            <button onClick={() => setCruisingStatus(null)} style={{ fontSize: 11, color: C.amber, background: `${C.amber}22`, padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>{cruisingStatus} ✕</button>
          ) : (
            <select onChange={e => e.target.value && setCruisingStatus(e.target.value)} value="" style={{ background: C.surf2, border: `1px solid ${C.border2}`, color: C.dim, padding: '5px 8px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
              <option value="">Status</option>
              {CRUISING.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <Avatar user={{ ...myProfile, online: true }} size={28} showStatus={false} ghost={isGhost} />
        </div>
      </header>

      {/* Ghost banner */}
      {isGhost && <GhostBanner onDisable={() => setIsGhost(false)} />}

      {/* Main */}
      <main style={{ height: `calc(100vh - 52px - ${TAB_H}px)`, overflow: screen === 'map' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', marginTop: isGhost ? 52 : 0, transition: 'margin-top 0.3s' }}>
        {screen === 'map' && (
          <MapScreen myProfile={{ ...myProfile, cruising_status: cruisingStatus }} nearby={nearby} myPos={myPos} onMovePin={handleMovePin} onSelectUser={setSelectedUser} isGhost={isGhost} onOpenPulseRoom={handleOpenPulseRoom} pulseRooms={pulseRooms} onCreatePulseRoom={handleCreatePulseRoom} />
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
        {screen === 'global' && (
          <GlobalChat userId={user?.id ?? null} isGhost={isGhost} />
        )}
        {screen === 'profile' && (
          <div style={{ padding: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Avatar user={{ ...myProfile, online: true }} size={80} ghost={isGhost} />
              <div style={{ fontWeight: 800, fontSize: 22, marginTop: 12 }}>{myProfile.name}</div>
              <div style={{ color: C.muted, fontSize: 14 }}>{myProfile.role} · {myProfile.age}</div>
              {isGhost && <div style={{ color: C.ghost, fontSize: 12, marginTop: 6 }}>👻 Ghost Mode Active</div>}
            </div>

            {/* Ghost toggle in profile */}
            <div style={{ background: isGhost ? 'rgba(100,255,218,0.06)' : C.surf2, border: `1px solid ${isGhost ? C.ghost + '33' : C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>👻</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: isGhost ? C.ghost : C.text }}>Ghost Mode</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Invisible on map. Chat anonymously. Reveal by liking.</div>
              </div>
              <button onClick={() => setIsGhost(g => !g)} style={{ width: 44, height: 24, borderRadius: 12, background: isGhost ? C.ghost : C.surf3, border: 'none', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 2, left: isGhost ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: isGhost ? C.bg : C.dim, transition: 'left 0.2s' }} />
              </button>
            </div>

            {/* Cruising status */}
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Cruising Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CRUISING.map(s => (
                <button key={s} onClick={() => setCruisingStatus(cruisingStatus === s ? null : s)} style={{ padding: '12px 16px', borderRadius: 12, background: cruisingStatus === s ? `${C.amber}22` : C.surf2, border: `1px solid ${cruisingStatus === s ? C.amber : C.border}`, color: cruisingStatus === s ? C.amber : C.text, fontWeight: cruisingStatus === s ? 700 : 400, textAlign: 'left', fontSize: 14 }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Pulse Rooms */}
            {pulseRooms.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Active Pulse Rooms</div>
                {pulseRooms.filter(r => Date.now() < r.expiresAt).map(room => (
                  <div key={room.id} onClick={() => { setActivePulseRoom(room); setScreen('map') }} style={{ padding: '12px 16px', borderRadius: 12, background: `${room.pulseColor}11`, border: `1px solid ${room.pulseColor}33`, marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>📡</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: room.pulseColor }}>{room.name}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{room.memberIds.length} members · expires {new Date(room.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <span style={{ color: C.muted }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, height: TAB_H, background: C.surface, borderTop: `1px solid ${C.border}`, display: 'flex', zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {([
          { id: 'map', label: 'Map', icon: '📍' },
          { id: 'list', label: 'Nearby', icon: '👥' },
          { id: 'global', label: 'Whore-izon', icon: '🔥' },
          { id: 'matches', label: 'Matches', icon: '❤️' },
          { id: 'profile', label: 'Me', icon: '👤' },
        ] as { id: Screen; label: string; icon: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setScreen(tab.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: screen === tab.id ? (isGhost && tab.id === 'global' ? C.ghost : C.accent) : C.dim, background: 'none', transition: 'color 0.15s' }}>
            <span style={{ fontSize: screen === tab.id ? 21 : 20 }}>{tab.icon}</span>
            <span style={{ fontSize: 9, fontWeight: screen === tab.id ? 700 : 400 }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Profile drawer */}
      {selectedUser && (
        <ProfileDrawer user={selectedUser as Profile & { isSeed?: boolean }} myId={user?.id ?? ''} onClose={() => setSelectedUser(null)} onLike={() => { if (!user || (selectedUser as any).isSeed) return; likeUser(user.id, selectedUser.id); if (isGhost) setIsGhost(false) }} onMessage={() => { setSelectedUser(null); setScreen('matches') }} />
      )}

      {/* Pulse Room overlay */}
      {activePulseRoom && Date.now() < activePulseRoom.expiresAt && myProfile && (
        <PulseRoomOverlay room={activePulseRoom} myProfile={{ ...myProfile, id: user?.id ?? 'anon' }} onClose={() => setActivePulseRoom(null)} onSend={handlePulseSend} />
      )}

      {/* PWA Install */}
      <InstallBanner />
    </div>
  )
}

// ─── PWA Install Banner ───────────────────────────────────────────────────────
function InstallBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [dismissed] = useState(() => localStorage.getItem('pwa_dismissed') === '1')

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show || dismissed) return null

  return (
    <div style={{ position: 'fixed', bottom: 76, left: 12, right: 12, zIndex: 300, background: C.surf3, border: `1px solid rgba(255,77,109,0.3)`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'slideUp 0.3s ease' }}>
      <div style={{ fontSize: 28 }}>📍</div>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>Add to Home Screen</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Install for the full experience</div></div>
      <button onClick={async () => { prompt?.prompt(); const { outcome } = await prompt.userChoice; if (outcome === 'accepted') setShow(false) }} style={{ padding: '8px 16px', borderRadius: 8, background: C.accent, color: '#fff', fontWeight: 700, fontSize: 13 }}>Install</button>
      <button onClick={() => { setShow(false); localStorage.setItem('pwa_dismissed', '1') }} style={{ color: C.dim, fontSize: 18 }}>✕</button>
    </div>
  )
}
