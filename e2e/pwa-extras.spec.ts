import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid } from './helpers'

const ME = { id: uid(51) }
const MEDIA = 'https://xebwdvtaivqjwbwbzdpv.supabase.co/storage/v1/object/public/media'

function seed() {
  const b = new FakeBackend()
  b.addProfile({ id: ME.id, name: 'ExtrasTester', location: { lat: 40.7484, lng: -73.9857 }, has_email: true })
  b.addProfile({ id: uid(52), name: 'PhotoGuy', location: { lat: 40.749, lng: -73.985 }, photo_url: `${MEDIA}/${uid(52)}/profile/1.jpg` })
  return b
}

test('blocked location: banner, platform steps, retry recovers', async ({ browser }) => {
  const backend = seed()
  const context = await browser.newContext({ permissions: [] })
  await backend.attach(context, ME)
  // Simulate "Don't Allow": every location request fails with PERMISSION_DENIED until we flip it back
  await context.addInitScript(() => {
    const w = window as unknown as { __locBlocked: boolean }
    w.__locBlocked = true
    const fake = (ok: PositionCallback, err?: PositionErrorCallback | null) => setTimeout(() => w.__locBlocked
      ? err?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      : ok({ coords: { latitude: 40.7484, longitude: -73.9857, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition), 50)
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: fake, watchPosition: (ok: PositionCallback, err?: PositionErrorCallback | null) => { fake(ok, err); return 1 }, clearWatch() {} } })
  })
  const page = await context.newPage()
  await page.goto('/app')
  await expect(page.getByText('Location is blocked, so nobody nearby can see you.')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Fix it' }).click()
  const help = page.getByRole('dialog', { name: 'Turn location back on' })
  await expect(help.getByText('Android Chrome')).toBeVisible() // Pixel 7 device profile
  await page.evaluate(() => { (window as unknown as { __locBlocked: boolean }).__locBlocked = false })
  await help.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Location is blocked, so nobody nearby can see you.')).toHaveCount(0)
})

test('Go Live holds a screen wake lock and ends cleanly', async ({ browser }) => {
  const backend = seed()
  const context = await browser.newContext()
  await backend.attach(context, ME)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 40.7484, longitude: -73.9857 })
  await context.addInitScript(() => {
    const w = window as unknown as { __wake: { held: number; released: number } }
    w.__wake = { held: 0, released: 0 }
    Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { w.__wake.held++; return { release: async () => { w.__wake.released++ }, addEventListener() {} } } } })
  })
  const page = await context.newPage()
  await page.goto('/app')
  await page.getByRole('button', { name: 'Go Live' }).click()
  await expect(page.getByRole('button', { name: 'End Live mode' })).toContainText(/LIVE · (2h 0m|1h 59m)/)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wake: { held: number } }).__wake.held)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'End Live mode' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wake: { released: number } }).__wake.released)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Go Live' })).toBeVisible()
})

test('profile photos load through short-lived signed links, never the public URL', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  const signRequests: string[] = []
  page.on('request', r => { if (r.url().includes('/storage/v1/object/sign/media')) signRequests.push(r.url()) })
  await page.getByText('Nearby', { exact: true }).last().click()
  await expect(page.getByText('PhotoGuy', { exact: true }).first()).toBeVisible()
  await expect.poll(() => signRequests.length).toBeGreaterThan(0)
  const srcs = await page.locator('img').evaluateAll(els => els.map(e => (e as HTMLImageElement).src))
  expect(srcs.some(s => s.includes('/object/public/media/'))).toBe(false)
  expect(srcs.some(s => s.includes('/object/sign/media/') && s.includes('token='))).toBe(true)
})

test('email alerts toggle saves to privacy settings', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  await page.getByText('Me', { exact: true }).last().click()
  await page.getByRole('button', { name: /Privacy settings/ }).first().click()
  await page.getByRole('switch', { name: 'Email alerts' }).click()
  await expect.poll(() => backend.t('profiles').find(p => p.id === ME.id)?.privacy?.email_alerts).toBe(true)
})
