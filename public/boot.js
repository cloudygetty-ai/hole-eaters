// Runs before the landing page renders: remembers ?ref / utm, and sends returning users,
// installed-app launches and sign-in links straight to /app. External file so the CSP can ban inline scripts.
(function () {
  try {
    var l = location, q = new URLSearchParams(l.search)
    var ref = q.get('ref')
    if (ref && /^[a-z0-9_-]{4,24}$/i.test(ref)) localStorage.setItem('he_ref', ref.toLowerCase())
    var utm = q.get('src') || q.get('utm_source')
    if (utm && /^[a-z0-9_.-]{1,40}$/i.test(utm)) localStorage.setItem('he_src', utm.toLowerCase())
    if (q.has('home')) return
    var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    var authCallback = /access_token|refresh_token|type=recovery|error_description/.test(l.hash) || q.has('code')
    var session = false
    for (var i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) { session = true; break }
    }
    if (standalone || authCallback || session) l.replace('/app' + l.search + l.hash)
  } catch (e) {}
})()
