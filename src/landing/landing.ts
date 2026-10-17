// Landing waitlist. Talks to Supabase RPCs over REST so the page ships no SDK.
import { joinWaitlist, getWaitlistStatus, type WaitlistStatus } from './waitlistApi'

const STORE_KEY = 'he_waitlist_code'
const SITE = 'https://www.hole-eaters.com'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const form = $<HTMLFormElement>('wl-form')
const errorEl = $<HTMLParagraphElement>('wl-error')
const result = $<HTMLDivElement>('wl-result')

function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: result still renders */ }
}

function inviteLink(code: string) {
  return `${SITE}/?ref=${code}&utm_source=waitlist_invite`
}

function showError(message: string) {
  errorEl.textContent = message
  errorEl.hidden = false
}

function render(status: WaitlistStatus) {
  form.hidden = true
  result.hidden = false
  $('wl-pos').textContent = status.position.toLocaleString()
  $('wl-sub').textContent = status.priority
    ? `Priority unlocked — ${status.referrals} invites in. You're getting it first.`
    : `of ${status.total.toLocaleString()}. Invite ${status.needed} more ${status.needed === 1 ? 'guy' : 'guys'} to jump to the front.`
  document.querySelectorAll('.wl-dots li').forEach((dot, i) => dot.classList.toggle('on', i < status.referrals))
  $('wl-link').textContent = inviteLink(status.code).replace('https://', '')

  $<HTMLButtonElement>('wl-share').onclick = async () => {
    const url = inviteLink(status.code)
    const text = 'Get on the Hole Eaters app list with me — the live cruising map for guys.'
    if (navigator.share) {
      await navigator.share({ title: 'Hole Eaters', text, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {})
    const btn = $<HTMLButtonElement>('wl-share')
    btn.textContent = 'Link copied'
    setTimeout(() => { btn.textContent = 'Share invite' }, 2000)
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorEl.hidden = true
  const data = new FormData(form)
  const email = String(data.get('email') ?? '').trim()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return showError('That email looks off.')
  if (!data.get('adult')) return showError('You need to be 18 or older.')

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  button.disabled = true
  button.textContent = 'Joining…'

  const response = await joinWaitlist({
    email,
    city: String(data.get('city') ?? ''),
    platform: String(data.get('platform') ?? 'either'),
    ref: readStored('he_ref'),
    source: readStored('he_src') ?? 'landing',
  })

  button.disabled = false
  button.textContent = 'Join the list'

  if (response.status === 'joined') {
    writeStored(STORE_KEY, response.code)
    render(response)
  } else if (response.status === 'exists') {
    showError("That email's already on the list. Check the device you signed up on for your invite link.")
  } else if (response.status === 'invalid_email') {
    showError('That email looks off.')
  } else {
    showError("Couldn't reach the list. Try again in a moment.")
  }
})

// Returning visitor: refresh their position (referrals may have landed since).
const storedCode = readStored(STORE_KEY)
if (storedCode) {
  getWaitlistStatus(storedCode).then((status) => { if (status) render(status) })
}
