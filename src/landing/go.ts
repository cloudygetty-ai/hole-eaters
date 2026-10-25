// Paid-traffic landing (/go). Message-matches the ad's headline and records the 18+ confirmation.
// Attribution itself is captured by the inline script in go.html before paint.

const HEADLINES: Record<string, string> = {
  // utm_content carries "<unit>-<angle>"; the angle picks the headline the visitor just clicked.
  afterdark: 'Your block,<br /><em>after dark.</em>',
  appetite: 'Appetite,<br /><em>mapped.</em>',
}

function angleFromUrl(): string | null {
  const content = new URLSearchParams(location.search).get('utm_content') ?? ''
  const angle = content.split('-').pop()?.toLowerCase() ?? ''
  return angle in HEADLINES ? angle : null
}

const angle = angleFromUrl()
const headline = document.getElementById('go-headline')
if (angle && headline) headline.innerHTML = HEADLINES[angle]

document.getElementById('go-enter')?.addEventListener('click', () => {
  try {
    localStorage.setItem('he_age_ok', new Date().toISOString())
  } catch {
    /* storage blocked (private mode): the app's own onboarding still applies */
  }
})
