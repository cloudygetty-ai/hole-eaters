import { initGate } from './gate'
import { captureAttribution, isInAppBrowser } from '../lib/attribution'

// Landing "Put it on your Home Screen" section: show the steps for the visitor's phone.
// Hole Eaters ships as a web app only (no native iPhone/Android apps planned), so this replaces the old app waitlist.

const isAndroid = /Android/i.test(navigator.userAgent)
const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function showSteps(phone: 'ios' | 'android') {
  document.querySelectorAll<HTMLOListElement>('.steps').forEach((list) => { list.hidden = list.dataset.phone !== phone })
}

document.querySelectorAll<HTMLInputElement>('input[name="phone"]').forEach((input) => {
  if (input.value === (isAndroid ? 'android' : 'ios')) input.checked = true
  input.addEventListener('change', () => showSteps(input.value as 'ios' | 'android'))
})
showSteps(isAndroid ? 'android' : 'ios')

if (standalone) {
  const done = document.getElementById('install-done')
  if (done) done.hidden = false
}

// Shown after in-app account deletion (/?home&deleted=1)
if (new URLSearchParams(location.search).has('deleted')) {
  const note = document.getElementById('deleted-note')
  if (note) { note.hidden = false; note.scrollIntoView({ block: 'center' }) }
}

// Ad clicks often open inside Instagram/TikTok/Grindr's own browser, where Add to Home Screen and
// push don't exist. Say so up front and make the link one tap to copy.
if (isInAppBrowser() && !standalone) {
  const bar = document.getElementById('gate-inapp')
  const copy = document.getElementById('gate-inapp-copy')
  const name = document.getElementById('gate-inapp-browser')
  if (bar && copy) {
    if (name && isAndroid) name.textContent = 'Chrome'
    bar.hidden = false
    copy.addEventListener('click', async () => {
      const url = location.origin + location.pathname + location.search
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied' }
      catch { window.prompt('Copy this link, then open it in your browser:', url) }
    })
  }
}

captureAttribution()
initGate()
