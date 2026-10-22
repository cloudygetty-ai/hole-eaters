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
