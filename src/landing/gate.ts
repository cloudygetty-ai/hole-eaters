// Landing sign-in gate: go anonymous (primary), log in, sign up or reset password, then hand off to /app.
// supabase-js loads only on first use so the landing stays light for visitors who just scroll.
// The client uses the default storage key (sb-<ref>-auth-token), so /app and boot.js pick up the session.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabasePublic'
import { attributionMeta } from '../lib/attribution'

type Mode = 'login' | 'signup'
type Field = 'email' | 'password' | null

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

let client: Promise<SupabaseClient> | null = null
function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: false } }))
  return client
}

// Supabase returns the same error for a wrong password and an email with no account, so the
// login failure points new people at Join instead of leaving them guessing.
function friendly(message: string, mode: Mode): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. New here? Tap Join free below.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox.'
  if (/already registered/i.test(message)) return 'That email already has an account. Log in instead.'
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.'
  if (/failed to fetch|network/i.test(message)) return 'No connection. Check your signal and try again.'
  if (/password/i.test(message) && mode === 'signup') return 'Pick a stronger password — at least 6 characters.'
  return message
}

export function initGate() {
  const form = $<HTMLFormElement>('gate-form')
  const submit = $<HTMLButtonElement>('gate-submit')
  const msg = $<HTMLParagraphElement>('gate-msg')
  const anonMsg = $<HTMLParagraphElement>('gate-anon-msg')
  const switchBtn = $<HTMLButtonElement>('gate-switch')
  const switchQ = $<HTMLSpanElement>('gate-switch-q')
  const forgot = $<HTMLButtonElement>('gate-forgot')
  const anon = $<HTMLButtonElement>('gate-anon')
  if (!form || !submit || !msg || !anonMsg || !switchBtn || !switchQ || !forgot || !anon) return

  const email = form.elements.namedItem('email') as HTMLInputElement
  const password = form.elements.namedItem('password') as HTMLInputElement
  let mode: Mode = 'login'

  const mark = (field: Field) => {
    email.toggleAttribute('aria-invalid', field === 'email')
    password.toggleAttribute('aria-invalid', field === 'password')
    if (field) (field === 'email' ? email : password).focus()
  }
  const say = (text: string, ok = false, field: Field = null) => {
    msg.textContent = text; msg.classList.toggle('ok', ok); msg.hidden = !text
    mark(text && !ok ? field : null)
  }
  const sayAnon = (text: string) => { anonMsg.textContent = text; anonMsg.hidden = !text }
  const busy = (on: boolean) => { submit.disabled = on; anon.disabled = on; forgot.disabled = on }
  const enterApp = () => location.replace('/app' + location.search)

  // Warm the auth chunk as soon as the visitor shows intent.
  const warm = () => { void getClient() }
  form.addEventListener('focusin', warm, { once: true })
  anon.addEventListener('pointerdown', warm, { once: true })
  email.addEventListener('input', () => email.removeAttribute('aria-invalid'))
  password.addEventListener('input', () => password.removeAttribute('aria-invalid'))

  switchBtn.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login'
    submit.textContent = mode === 'login' ? 'Log in' : 'Create account'
    switchQ.textContent = mode === 'login' ? 'Want a profile now?' : 'Already a member?'
    switchBtn.textContent = mode === 'login' ? 'Join free' : 'Log in'
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password'
    forgot.hidden = mode === 'signup'
    say('')
    if (email.value.trim()) password.focus(); else email.focus()
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!email.value.trim() || !email.checkValidity()) return say('Enter a valid email.', false, 'email')
    if (password.value.length < 6) return say('Password needs at least 6 characters.', false, 'password')
    busy(true); say('')
    try {
      const sb = await getClient()
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
        if (error) return say(friendly(error.message, mode), false, 'password')
        return enterApp()
      }
      const { data, error } = await sb.auth.signUp({
        email: email.value.trim(), password: password.value,
        options: { emailRedirectTo: location.origin, data: attributionMeta() },
      })
      if (error) return say(friendly(error.message, mode), false, /already registered/i.test(error.message) ? 'email' : null)
      if (data.session) return enterApp()
      say('Check your email to confirm your account, then come back and log in.', true)
    } catch (err) {
      say(friendly(err instanceof Error ? err.message : 'Something went wrong. Try again.', mode))
    } finally {
      busy(false)
    }
  })

  forgot.addEventListener('click', async () => {
    if (!email.value.trim() || !email.checkValidity()) return say('Enter your email above first.', false, 'email')
    busy(true)
    try {
      const sb = await getClient()
      const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin })
      say(error ? friendly(error.message, mode) : 'Reset link sent. Check your email.', !error)
    } catch {
      say('No connection. Check your signal and try again.')
    } finally {
      busy(false)
    }
  })

  anon.addEventListener('click', async () => {
    busy(true); sayAnon('')
    try {
      const sb = await getClient()
      const { error } = await sb.auth.signInAnonymously({ options: { data: attributionMeta() } })
      if (error) return sayAnon(friendly(error.message, mode))
      enterApp()
    } catch {
      sayAnon('No connection. Check your signal and try again.')
    } finally {
      busy(false)
    }
  })
}
