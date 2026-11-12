// Landing sign-in gate: log in, sign up, reset password, or go anonymous, then hand off to /app.
// supabase-js loads only on first use so the landing stays light for visitors who just scroll.
// The client uses the default storage key (sb-<ref>-auth-token), so /app and boot.js pick up the session.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabasePublic'

type Mode = 'login' | 'signup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

let client: Promise<SupabaseClient> | null = null
function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: false } }))
  return client
}

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox.'
  if (/already registered/i.test(message)) return 'That email already has an account. Log in instead.'
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.'
  if (/failed to fetch|network/i.test(message)) return 'No connection. Check your signal and try again.'
  return message
}

export function initGate() {
  const form = $<HTMLFormElement>('gate-form')
  const submit = $<HTMLButtonElement>('gate-submit')
  const msg = $<HTMLParagraphElement>('gate-msg')
  const switchBtn = $<HTMLButtonElement>('gate-switch')
  const switchQ = $<HTMLSpanElement>('gate-switch-q')
  const forgot = $<HTMLButtonElement>('gate-forgot')
  const anon = $<HTMLButtonElement>('gate-anon')
  if (!form || !submit || !msg || !switchBtn || !switchQ || !forgot || !anon) return

  const email = form.elements.namedItem('email') as HTMLInputElement
  const password = form.elements.namedItem('password') as HTMLInputElement
  let mode: Mode = 'login'

  const say = (text: string, ok = false) => { msg.textContent = text; msg.classList.toggle('ok', ok); msg.hidden = !text }
  const busy = (on: boolean) => { submit.disabled = on; anon.disabled = on; forgot.disabled = on }
  const enterApp = () => location.replace('/app' + location.search)

  // Warm the auth chunk as soon as the visitor shows intent.
  form.addEventListener('focusin', () => { void getClient() }, { once: true })

  switchBtn.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login'
    submit.textContent = mode === 'login' ? 'Step inside' : 'Create account'
    switchQ.textContent = mode === 'login' ? 'New here?' : 'Already a member?'
    switchBtn.textContent = mode === 'login' ? 'Join free' : 'Log in'
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password'
    forgot.hidden = mode === 'signup'
    say('')
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!email.value.trim() || !email.checkValidity()) return say('Enter a valid email.')
    if (password.value.length < 6) return say('Password needs at least 6 characters.')
    busy(true); say('')
    try {
      const sb = await getClient()
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
        if (error) return say(friendly(error.message))
        return enterApp()
      }
      const { data, error } = await sb.auth.signUp({
        email: email.value.trim(), password: password.value, options: { emailRedirectTo: location.origin },
      })
      if (error) return say(friendly(error.message))
      if (data.session) return enterApp()
      say('Check your email to confirm your account, then come back and log in.', true)
    } catch (err) {
      say(friendly(err instanceof Error ? err.message : 'Something went wrong. Try again.'))
    } finally {
      busy(false)
    }
  })

  forgot.addEventListener('click', async () => {
    if (!email.value.trim() || !email.checkValidity()) { email.focus(); return say('Enter your email above first.') }
    busy(true)
    try {
      const sb = await getClient()
      const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin })
      say(error ? friendly(error.message) : 'Reset link sent. Check your email.', !error)
    } catch {
      say('No connection. Check your signal and try again.')
    } finally {
      busy(false)
    }
  })

  anon.addEventListener('click', async () => {
    busy(true); say('')
    try {
      const sb = await getClient()
      const { error } = await sb.auth.signInAnonymously()
      if (error) return say(friendly(error.message))
      enterApp()
    } catch {
      say('No connection. Check your signal and try again.')
    } finally {
      busy(false)
    }
  })
}
