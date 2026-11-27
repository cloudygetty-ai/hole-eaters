import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { submitReport, getProfileCards, type Profile, type ReportReason } from '../lib/supabase'
import { MediaImg } from './Media'

// Report, Block and Unblock, shared by profiles, 1:1 chats, Whore-izon and Pulse Rooms.
// Blocks are enforced on the server (see supabase/migrations/20261030100000_security_audit_phase1.sql);
// these components only collect the person's choice and hand it to the caller.

export interface SafetyTheme { surface: string; surf2: string; surf3: string; border: string; border2: string; text: string; muted: string; dim: string; accent: string }
export interface SafetyTarget { id: string; name: string }

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'fake_profile', label: 'Fake Profile' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'underage', label: 'Underage' },
  { id: 'spam', label: 'Spam' },
  { id: 'inappropriate_photo', label: 'Inappropriate Photo' },
  { id: 'other', label: 'Other' },
]

// Same characters the database refuses in report details (public.has_unsafe_chars); stripping them
// here means a pasted message can't make the whole report fail.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g
const DETAILS_MAX = 2000

/** Where the report came from goes first, so moderators know which screen to look at. */
function reportDetails(context: string | undefined, text: string): string | undefined {
  const typed = text.replace(UNSAFE, '').trim()
  const where = context?.replace(UNSAFE, '').trim()
  const out = where ? (typed ? `${where} · ${typed}` : where) : typed
  return out ? out.slice(0, DETAILS_MAX) : undefined
}

const btn = (bg: string, border: string, color: string) => ({ padding: '12px', borderRadius: 12, background: bg, border: `1px solid ${border}`, color, fontWeight: 700, fontSize: 14 }) as const
const RED = '#ef4444'
const STACK = { display: 'flex', flexDirection: 'column', gap: 10 } as const

/** Reason + details + Submit. With `onBlock`, also offers Block, before or after the report goes. */
export function ReportForm({ theme: t, myId, target, context, hint, onBlock }: {
  theme: SafetyTheme; myId: string; target: SafetyTarget; context?: string; hint?: string; onBlock?: () => void
}) {
  const [reason, setReason] = useState<ReportReason>('fake_profile')
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [blocked, setBlocked] = useState(false)

  const send = async () => {
    if (!myId || state === 'sending') return
    setState('sending')
    const { error } = await submitReport(myId, target.id, reason, reportDetails(context, text))
    if (error) console.error('[report] save failed', error)
    setState(error ? 'failed' : 'sent')
  }
  const block = () => { if (blocked || !onBlock) return; setBlocked(true); onBlock() }
  const blockButton = onBlock && (
    <button onClick={block} disabled={blocked} style={btn(blocked ? t.surf3 : 'rgba(107,114,128,0.15)', blocked ? t.border : 'rgba(107,114,128,0.4)', blocked ? t.dim : t.muted)}>
      {blocked ? '✓ Blocked' : state === 'sent' ? `🚫 Block ${target.name} too` : '🚫 Block User'}
    </button>
  )

  if (state === 'sent') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div role="status" style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
        <p style={{ fontWeight: 700, color: t.text }}>Report submitted</p>
        <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>Only you and our moderators can see it. {target.name} isn't told.</p>
      </div>
      {blockButton}
    </div>
  )

  const field = { background: t.surf3, border: `1px solid ${t.border2}`, borderRadius: 10, padding: '10px 14px', color: t.text, fontSize: 14, outline: 'none' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label htmlFor="report-reason" style={{ fontSize: 13, color: t.muted }}>Why are you reporting {target.name}?</label>
      <select id="report-reason" value={reason} onChange={e => setReason(e.target.value as ReportReason)} style={field}>
        {REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      {hint && <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.45 }}>{hint}</div>}
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Additional details (optional)" aria-label="Additional details" rows={3} maxLength={1500} style={{ ...field, resize: 'none' }} />
      {state === 'failed' && <div role="alert" style={{ fontSize: 13, color: RED }}>Your report didn't send. Check your connection and try again.</div>}
      <button onClick={send} disabled={state === 'sending'} style={{ ...btn('rgba(239,68,68,0.15)', 'rgba(239,68,68,0.4)', RED), opacity: state === 'sending' ? 0.6 : 1 }}>
        {state === 'sending' ? 'Sending…' : 'Submit Report'}
      </button>
      {blockButton}
    </div>
  )
}

/** Bottom sheet behind a chat's ⋯ button or a name in a room: pick Report or Block. */
export function SafetySheet({ theme: t, myId, target, context, hint, onBlock, onClose }: {
  theme: SafetyTheme; myId: string; target: SafetyTarget; context?: string; hint?: string
  onBlock: (id: string) => void; onClose: () => void
}) {
  const [step, setStep] = useState<'menu' | 'report' | 'block'>('menu')
  const block = () => { onBlock(target.id); onClose() }

  // Portaled to <body>: the rooms that open this sheet sit inside animated (transformed) panels,
  // which would otherwise trap a position:fixed overlay inside them.
  return createPortal(
    <div role="dialog" aria-label={`Report or block ${target.name}`} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      {/* Plain block layout like the delete-account sheet; only the tall report form scrolls */}
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: t.surface, borderRadius: '22px 22px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', ...(step === 'report' ? { maxHeight: '85vh', overflowY: 'auto' } : {}) }}>
        {step === 'menu' && <div style={STACK}>
          <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 4 }}>{target.name}</div>
          <button onClick={() => setStep('report')} style={btn('rgba(239,68,68,0.12)', 'rgba(239,68,68,0.35)', RED)}>🚩 Report {target.name}</button>
          <button onClick={() => setStep('block')} style={btn(t.surf3, t.border2, t.text)}>🚫 Block {target.name}</button>
          <button onClick={onClose} style={{ padding: 12, color: t.dim, fontWeight: 700, fontSize: 14 }}>Cancel</button>
        </div>}
        {step === 'report' && <div style={STACK}>
          <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 4 }}>Report {target.name}</div>
          <ReportForm theme={t} myId={myId} target={target} context={context} hint={hint} onBlock={block} />
          <button onClick={onClose} style={{ padding: 12, color: t.dim, fontWeight: 700, fontSize: 14 }}>Done</button>
        </div>}
        {step === 'block' && <>
          <div style={{ fontWeight: 800, fontSize: 18, color: t.text }}>Block {target.name}?</div>
          <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.55, marginTop: 8 }}>
            You disappear from each other's map, and they can't message, like or review you. They aren't told. You can unblock them any time in Me → Privacy settings → Blocked people.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={onClose} style={{ ...btn(t.surf3, t.border2, t.text), flex: 1 }}>Cancel</button>
            <button onClick={block} style={{ ...btn(RED, RED, '#fff'), flex: 1, fontWeight: 800 }}>Block</button>
          </div>
        </>}
      </div>
    </div>,
    document.body,
  )
}

type Card = Pick<Profile, 'id' | 'name' | 'emoji' | 'color' | 'photo_url'>

/** Everyone you've blocked, with Unblock (and Block again, in case of a slip). */
export function BlockedPeople({ theme: t, ids, onUnblock, onBlock, onClose }: {
  theme: SafetyTheme; ids: string[]; onUnblock: (id: string) => Promise<boolean>; onBlock: (id: string) => void; onClose: () => void
}) {
  // The list is read once when the sheet opens, so rows stay put (as "Unblocked") after a tap
  const [cards, setCards] = useState<Card[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [unblocked, setUnblocked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [initialIds] = useState(ids)

  useEffect(() => {
    let live = true
    getProfileCards(initialIds).then(({ data, error }) => {
      if (!live) return
      if (error) { setLoadFailed(true); return }
      setCards([...data].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')))
    })
    return () => { live = false }
  }, [initialIds])

  const unblock = async (id: string) => {
    setBusy(id); setFailed(null)
    const ok = await onUnblock(id)
    setBusy(null)
    if (ok) setUnblocked(prev => new Set(prev).add(id)); else setFailed(id)
  }
  const reblock = (id: string) => { onBlock(id); setUnblocked(prev => { const n = new Set(prev); n.delete(id); return n }) }

  return (
    <div role="dialog" aria-label="Blocked people" style={{ position: 'fixed', inset: 0, zIndex: 890, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '80vh', overflowY: 'auto', background: t.surface, borderRadius: '22px 22px 0 0', padding: '22px 20px calc(24px + env(safe-area-inset-bottom))' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: t.text, marginBottom: 6 }}>Blocked people</div>
        <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Unblocking puts you back on each other's map. They aren't told either way.
        </div>
        {loadFailed && <div role="alert" style={{ fontSize: 13, color: RED, padding: '12px 0' }}>Couldn't load your blocked list. Check your connection and try again.</div>}
        {!loadFailed && cards === null && <div style={{ fontSize: 13, color: t.dim, padding: '12px 0' }}>Loading…</div>}
        {cards?.length === 0 && <div style={{ fontSize: 14, color: t.dim, padding: '16px 0', textAlign: 'center' }}>You haven't blocked anyone.</div>}
        {cards?.map(c => {
          const isUnblocked = unblocked.has(c.id)
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${t.border}` }}>
              <div aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: `${c.color ?? t.accent}22`, border: `1.5px solid ${c.color ?? t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {c.photo_url ? <MediaImg src={c.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : c.emoji ?? '👤'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Member'}</div>
                {isUnblocked && <div style={{ fontSize: 12, color: t.dim }}>Unblocked</div>}
                {failed === c.id && <div role="alert" style={{ fontSize: 12, color: RED }}>Didn't work. Try again.</div>}
              </div>
              {isUnblocked
                ? <button onClick={() => reblock(c.id)} aria-label={`Block ${c.name || 'member'} again`} style={{ ...btn(t.surf3, t.border2, t.muted), padding: '8px 12px', fontSize: 13 }}>Block again</button>
                : <button onClick={() => unblock(c.id)} disabled={busy === c.id} aria-label={`Unblock ${c.name || 'member'}`} style={{ ...btn(t.surf3, t.border2, t.text), padding: '8px 14px', fontSize: 13, opacity: busy === c.id ? 0.6 : 1 }}>{busy === c.id ? '…' : 'Unblock'}</button>}
            </div>
          )
        })}
        <button onClick={onClose} style={{ width: '100%', marginTop: 14, ...btn(t.surf3, t.border2, t.text) }}>Done</button>
      </div>
    </div>
  )
}
