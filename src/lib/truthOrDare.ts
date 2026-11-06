// Truth or Dare for 1-on-1 chat. Prompts travel inside the E2EE payload (field `g`) with the
// prompt text also in `t`, so clients without this feature still show it as a normal message.

export type TodKind = 'truth' | 'dare'
export type TodLevel = 'mild' | 'spicy' | 'afterdark'
export interface TodPrompt { v: 1; kind: TodKind; level: TodLevel; id: string }

export const TOD_LEVELS: Array<{ level: TodLevel; label: string; emoji: string }> = [
  { level: 'mild', label: 'Mild', emoji: '😇' },
  { level: 'spicy', label: 'Spicy', emoji: '🌶️' },
  { level: 'afterdark', label: 'After Dark', emoji: '🌙' },
]

type Deck = Record<TodLevel, Record<TodKind, string[]>>

// Keep prompts consent-forward: every card can be skipped, dares never involve third parties or location.
const DECK: Deck = {
  mild: {
    truth: [
      "What made you open my profile?",
      "What's your go-to first-date move?",
      "Best compliment you've ever gotten from a guy?",
      "What song is stuck in your head right now?",
      "What's the most spontaneous thing you've done this year?",
      "What's a green flag that gets you every time?",
      "Morning person or night owl — and what does your perfect night look like?",
      "What's your most-used emoji and why?",
      "Who was your first celebrity crush?",
      "What's something you're weirdly good at?",
    ],
    dare: [
      "Send your best selfie from this week.",
      "Send a voice note saying hi in your sexiest voice.",
      "Describe me in three words — no backing out.",
      "Send the last photo in your camera roll you're willing to share.",
      "Send a sticker that sums up your mood.",
      "Send a voice note of your laugh.",
      "Tell me your best pickup line — and use it on me.",
      "Send a pic of what you're wearing right now.",
    ],
  },
  spicy: {
    truth: [
      "What's the first thing you notice on a guy?",
      "What's your biggest turn-on that most people wouldn't guess?",
      "Top, bottom or vers — and what's your favorite part of it?",
      "What's the hottest message you've ever received?",
      "Where's the most adventurous place you've hooked up?",
      "What's something you've always wanted to try but haven't yet?",
      "What do you want me to do the first time we meet?",
      "What outfit makes you feel the hottest?",
      "Describe your ideal hookup in one sentence.",
      "What's your favorite way to be kissed?",
    ],
    dare: [
      "Send a shirtless pic.",
      "Send a voice note telling me what you'd do if I were there right now.",
      "Send a pic of your best angle.",
      "Describe exactly how you'd greet me at the door.",
      "Send a pic in your favorite underwear.",
      "Tell me one thing you'd want me to wear.",
      "Send a 10-second voice note — make it filthy.",
      "Rate my profile pic out of 10 and say why.",
    ],
  },
  afterdark: {
    truth: [
      "What's your wildest fantasy you've never said out loud?",
      "What's the kinkiest thing you're into?",
      "What's your hard limit — and what's a soft limit you'd explore?",
      "What position do you want to try with me first?",
      "What's the best hookup you've ever had and what made it great?",
      "How do you like to be talked to in bed?",
      "What would make you say yes to meeting tonight?",
      "What's one thing you'd want me to do without asking first? (We'll confirm IRL.)",
    ],
    dare: [
      "Send a pic you'd only send after dark.",
      "Send a voice note describing exactly what you want from me.",
      "Show me your favorite toy — or tell me what it is.",
      "Write out, step by step, how our first night goes.",
      "Send a video — your call how far it goes.",
      "Tell me what you're doing with your hands right now.",
    ],
  },
}

const KIND_LABEL: Record<TodKind, string> = { truth: 'Truth', dare: 'Dare' }

const isKind = (x: unknown): x is TodKind => x === 'truth' || x === 'dare'
const isLevel = (x: unknown): x is TodLevel => x === 'mild' || x === 'spicy' || x === 'afterdark'

/** Validates the untrusted `g` field from a decrypted payload. */
export function asTodPrompt(x: unknown): TodPrompt | null {
  if (!x || typeof x !== 'object') return null
  const g = x as Record<string, unknown>
  if (g.v !== 1 || !isKind(g.kind) || !isLevel(g.level) || typeof g.id !== 'string' || g.id.length > 16) return null
  return { v: 1, kind: g.kind, level: g.level, id: g.id }
}

/** Prompt text from the local deck; null if the sender's deck had a card we don't (newer client). */
export function todText(p: TodPrompt): string | null {
  const i = Number(p.id)
  return Number.isInteger(i) ? DECK[p.level][p.kind][i] ?? null : null
}

/** Random card, avoiding ids already played in this chat. Resets once the pile is exhausted. */
export function pickTod(kind: TodKind, level: TodLevel, played: ReadonlySet<string>): TodPrompt {
  const pile = DECK[level][kind]
  const fresh = pile.map((_, i) => String(i)).filter(id => !played.has(`${level}:${kind}:${id}`))
  const pool = fresh.length ? fresh : pile.map((_, i) => String(i))
  return { v: 1, kind, level, id: pool[Math.floor(Math.random() * pool.length)] }
}

export const todKey = (p: TodPrompt) => `${p.level}:${p.kind}:${p.id}`

/** Plain-text fallback carried in `t` for clients without the game. */
export function todFallback(p: TodPrompt): string {
  const lvl = TOD_LEVELS.find(l => l.level === p.level)!
  return `🎲 ${KIND_LABEL[p.kind]} ${lvl.emoji}: ${todText(p) ?? ''}`
}

export const todLabel = (p: TodPrompt) => KIND_LABEL[p.kind]
export const todLevelMeta = (level: TodLevel) => TOD_LEVELS.find(l => l.level === level)!
