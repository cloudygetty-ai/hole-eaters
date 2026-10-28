import { useEffect, useState } from 'react'
import { getReviews, getReviewSummary, getMyReviewFor, saveReview, deleteMyReview, flagReview, type Review, type ReviewSummary, type MeetOutcome } from '../lib/supabase'

// Reviews + Flake Scale. Used in the profile drawer (read + write) and on Me (your own, with flagging).
// Reviewers stay anonymous; the database only lets people who have messaged each other leave a review.

export interface ReviewsTheme { accent: string; surf3: string; border: string; border2: string; text: string; muted: string; dim: string; green: string; amber: string; orange: string; red: string }

export const POSITIVE_TAGS = ['As pictured', 'Hot', 'Clean', 'Respectful', 'Great host', "Knows what he's doing", 'Down to earth']
export const NEGATIVE_TAGS = ['Not as pictured', 'Rude', 'Pushy', 'Bad hygiene', 'Ghosted']

const OUTCOMES: { key: MeetOutcome; label: string; icon: string }[] = [
  { key: 'showed', label: 'Showed up', icon: '✅' },
  { key: 'late', label: 'Showed up late', icon: '⏰' },
  { key: 'flaked', label: 'Flaked', icon: '🫥' },
  { key: 'chat_only', label: 'Just chatted', icon: '💬' },
]
const OUTCOME_LABEL: Record<MeetOutcome, string> = { showed: '✅ Showed up', late: '⏰ Late', flaked: '🫥 Flaked', chat_only: '💬 Chatted' }

// Same rule the database enforces, so people see the problem before saving
const CONTACT_INFO = /(https?:\/\/|www\.|\d{3}[\s.()-]*\d{3}[\s.-]*\d{4})/i
const BODY_MAX = 200

// ── Flake scale: 1 = always shows, 5 = major flake ─────────────────────────────
export interface FlakeLevel { level: 1 | 2 | 3 | 4 | 5; label: string; color: string }

export function flakeLevel(s: ReviewSummary | null, t: ReviewsTheme): FlakeLevel | null {
  if (!s || !s.meetups || s.flake_rate == null) return null
  const r = Number(s.flake_rate)
  if (r <= 0.1) return { level: 1, label: 'Solid. Shows up', color: t.green }
  if (r <= 0.25) return { level: 2, label: 'Usually shows', color: '#84cc16' }
  if (r <= 0.5) return { level: 3, label: 'A bit flaky', color: t.amber }
  if (r <= 0.75) return { level: 4, label: 'Flaky', color: t.orange }
  return { level: 5, label: 'Major flake', color: t.red }
}

export function FlakeMeter({ summary, theme: t }: { summary: ReviewSummary | null; theme: ReviewsTheme }) {
  const f = flakeLevel(summary, t)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>Flake scale</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: f?.color ?? t.dim }}>{f ? `${f.level}/5 · ${f.label}` : 'No meetups reported'}</span>
      </div>
      <div role="meter" aria-label="Flake scale" aria-valuemin={1} aria-valuemax={5} aria-valuenow={f?.level ?? 0} style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: f && i <= f.level ? f.color : t.surf3, border: `1px solid ${t.border}` }} />
        ))}
      </div>
      {summary && summary.meetups > 0 && (
        <div style={{ fontSize: 11, color: t.dim, marginTop: 6 }}>
          {summary.showed} showed · {summary.late} late · {summary.flaked} flaked, from {summary.meetups} meetup{summary.meetups === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}

const Stars = ({ value, size = 14, color }: { value: number; size?: number; color: string }) => (
  <span aria-label={`${value} out of 5 stars`} style={{ fontSize: size, color, letterSpacing: 1 }}>
    {'★★★★★'.slice(0, Math.round(value))}<span style={{ opacity: 0.25 }}>{'★★★★★'.slice(Math.round(value))}</span>
  </span>
)

/** Compact "★ 4.6 (12) · Flake 1/5" line for the profile header. Renders nothing until there are reviews. */
export function ReviewBadge({ summary, theme: t, onClick }: { summary: ReviewSummary | null; theme: ReviewsTheme; onClick?: () => void }) {
  if (!summary?.review_count) return null
  const f = flakeLevel(summary, t)
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.muted, padding: 0, marginBottom: 10 }}>
      {summary.avg_rating != null && <span style={{ color: t.amber, fontWeight: 800 }}>★ {Number(summary.avg_rating).toFixed(1)}</span>}
      <span>{summary.review_count} review{summary.review_count === 1 ? '' : 's'}</span>
      {f && <span style={{ color: f.color, background: `${f.color}1f`, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Flake {f.level}/5</span>}
    </button>
  )
}

function ReviewItem({ r, t, canFlag }: { r: Review; t: ReviewsTheme; canFlag: boolean }) {
  const [flagged, setFlagged] = useState(false)
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: r.met === 'flaked' ? t.red : r.met === 'late' ? t.amber : t.muted, fontWeight: 700 }}>{OUTCOME_LABEL[r.met]}</span>
        {r.rating != null && <Stars value={r.rating} color={t.amber} size={12} />}
        <span style={{ marginLeft: 'auto', color: t.dim, fontSize: 11 }}>{r.is_mine ? 'You · ' : ''}{new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
      {r.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
          {r.tags.map(tag => {
            const bad = NEGATIVE_TAGS.includes(tag)
            return <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: bad ? `${t.red}1a` : t.surf3, color: bad ? t.red : t.muted }}>{tag}</span>
          })}
        </div>
      )}
      {r.body && <p style={{ fontSize: 13, color: t.text, lineHeight: 1.45, marginTop: 7 }}>{r.body}</p>}
      {canFlag && (
        <button disabled={flagged} onClick={async () => { const { error } = await flagReview(r.id); if (!error) setFlagged(true) }}
          style={{ fontSize: 11, color: t.dim, marginTop: 6, padding: 0, textDecoration: flagged ? 'none' : 'underline' }}>
          {flagged ? 'Sent to a moderator' : 'Report this review'}
        </button>
      )}
    </div>
  )
}

function ReviewForm({ myId, targetId, targetName, t, onSaved }: { myId: string; targetId: string; targetName: string; t: ReviewsTheme; onSaved: () => void }) {
  const [met, setMet] = useState<MeetOutcome | null>(null)
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [existing, setExisting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getMyReviewFor(myId, targetId).then(({ data }) => {
      if (!data) return
      setExisting(true); setMet(data.met as MeetOutcome); setRating(data.rating ?? 0); setTags(data.tags ?? []); setBody(data.body ?? '')
    })
  }, [myId, targetId])

  const flaked = met === 'flaked'
  const contactErr = CONTACT_INFO.test(body) ? 'No phone numbers or links in reviews.' : ''
  const ready = !!met && (flaked || rating > 0) && !contactErr && !saving
  const toggleTag = (tag: string) => setTags(cur => cur.includes(tag) ? cur.filter(x => x !== tag) : cur.length >= 6 ? cur : [...cur, tag])

  async function save() {
    if (!ready || !met) return
    setSaving(true); setErr('')
    const { error } = await saveReview(myId, targetId, { met, rating: flaked ? null : rating, tags, body: body.trim() || null })
    setSaving(false)
    if (error) setErr(error.code === '42501' ? `You can review ${targetName} once you've both messaged each other.` : "Couldn't save your review. Try again.")
    else { setExisting(true); onSaved() }
  }

  async function remove() {
    setSaving(true)
    const { error } = await deleteMyReview(myId, targetId)
    setSaving(false)
    if (!error) { setExisting(false); setMet(null); setRating(0); setTags([]); setBody(''); onSaved() }
  }

  const chip = (on: boolean, color = t.accent) => ({ padding: '7px 11px', borderRadius: 16, fontSize: 12, fontWeight: 600, background: on ? `${color}22` : t.surf3, border: `1px solid ${on ? color : t.border2}`, color: on ? color : t.muted })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{existing ? 'Your review' : `Review ${targetName}`} <span style={{ color: t.dim, fontWeight: 500 }}>· anonymous</span></div>

      <div>
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 6 }}>Did you meet up?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {OUTCOMES.map(o => (
            <button key={o.key} onClick={() => setMet(o.key)} style={chip(met === o.key, o.key === 'flaked' ? t.red : t.accent)}>{o.icon} {o.label}</button>
          ))}
        </div>
      </div>

      {met && !flaked && (
        <div>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>{met === 'chat_only' ? 'How was the chat?' : 'How was it?'}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setRating(n)} style={{ fontSize: 30, lineHeight: 1, color: n <= rating ? t.amber : t.surf3, padding: 2 }}>★</button>
            ))}
          </div>
        </div>
      )}

      {met && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(flaked ? ['Ghosted', 'Rude'] : [...POSITIVE_TAGS, ...NEGATIVE_TAGS]).map(tag => (
            <button key={tag} onClick={() => toggleTag(tag)} style={chip(tags.includes(tag), NEGATIVE_TAGS.includes(tag) ? t.red : t.green)}>{tag}</button>
          ))}
        </div>
      )}

      {met && (
        <div>
          <textarea value={body} onChange={e => setBody(e.target.value.slice(0, BODY_MAX))} rows={2} placeholder="Anything else? (optional)"
            style={{ width: '100%', background: t.surf3, border: `1px solid ${contactErr ? t.red : t.border2}`, borderRadius: 10, padding: '10px 12px', color: t.text, fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3 }}>
            <span style={{ color: t.red }}>{contactErr || err}</span>
            <span style={{ color: t.dim }}>{body.length}/{BODY_MAX}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={!ready} style={{ flex: 1, padding: 12, borderRadius: 12, background: ready ? t.accent : t.surf3, color: ready ? '#fff' : t.dim, fontWeight: 800, fontSize: 14 }}>
          {saving ? 'Saving…' : existing ? 'Update review' : 'Post review'}
        </button>
        {existing && <button onClick={remove} disabled={saving} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.border2}`, color: t.dim, fontSize: 13 }}>Delete</button>}
      </div>
    </div>
  )
}

/**
 * Full reviews panel. `self` = viewing reviews about yourself (no form, can report reviews).
 * `onSummary` lets the parent show the header badge without a second fetch.
 */
export function ReviewsPanel({ targetId, targetName, myId, theme: t, self = false, onSummary }: {
  targetId: string; targetName: string; myId: string; theme: ReviewsTheme; self?: boolean; onSummary?: (s: ReviewSummary | null) => void
}) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    Promise.all([getReviewSummary(targetId), getReviews(targetId)]).then(([s, r]) => {
      if (!live) return
      setSummary(s.data); setReviews(r.data); onSummary?.(s.data)
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [targetId, version]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !summary) return <div style={{ textAlign: 'center', padding: '20px 0', color: t.dim, fontSize: 13 }}>Loading reviews…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: t.text }}>{summary?.avg_rating != null ? Number(summary.avg_rating).toFixed(1) : '—'}</div>
        <div>
          <Stars value={Number(summary?.avg_rating ?? 0)} color={t.amber} size={16} />
          <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>{summary?.review_count ? `${summary.review_count} review${summary.review_count === 1 ? '' : 's'}` : 'No reviews yet'}</div>
        </div>
      </div>

      <FlakeMeter summary={summary} theme={t} />

      {!self && (summary?.can_review
        ? <ReviewForm myId={myId} targetId={targetId} targetName={targetName} t={t} onSaved={() => setVersion(v => v + 1)} />
        : <div style={{ fontSize: 12, color: t.dim, background: t.surf3, borderRadius: 10, padding: '10px 12px' }}>
            💬 You can review {targetName} after you've both messaged each other.
          </div>)}

      {reviews.length > 0 && (
        <div>
          {reviews.map(r => <ReviewItem key={r.id} r={r} t={t} canFlag={self} />)}
        </div>
      )}
    </div>
  )
}

/** Me page card: your rating + flake level at a glance, expands to the reviews about you (with Report). */
export function MyReviewsCard({ myId, theme: t, surface }: { myId: string; theme: ReviewsTheme; surface: string }) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  useEffect(() => { getReviewSummary(myId).then(({ data }) => setSummary(data)) }, [myId])
  const f = flakeLevel(summary, t)
  return (
    <div style={{ background: surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 16px' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: 0 }}>
        <span style={{ fontSize: 22 }}>⭐</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Your reviews</div>
          <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>
            {summary?.review_count
              ? `${summary.avg_rating != null ? `★ ${Number(summary.avg_rating).toFixed(1)} · ` : ''}${summary.review_count} review${summary.review_count === 1 ? '' : 's'}${f ? ` · Flake ${f.level}/5` : ''}`
              : 'No reviews yet. Show up and they’ll come.'}
          </div>
        </div>
        <span style={{ color: t.dim, fontSize: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
      </button>
      {open && <div style={{ marginTop: 14 }}><ReviewsPanel targetId={myId} targetName="you" myId={myId} theme={t} self onSummary={setSummary} /></div>}
    </div>
  )
}
