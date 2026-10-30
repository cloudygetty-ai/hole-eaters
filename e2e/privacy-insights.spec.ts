import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, openProfile, uid } from './helpers'

const ME = { id: uid(31) }, A = { id: uid(32) }, B = { id: uid(33) }, C = { id: uid(34) }

function seed() {
  const b = new FakeBackend()
  b.addProfile({ id: ME.id, name: 'MeTest', age: 34, location: { lat: 40.7515, lng: -73.9885 }, reply_rate: 8 })
  b.addProfile({ id: A.id, name: 'TopGuy', role: 'Top', age: 29, details: { body: 'Muscular' }, location: { lat: 40.7455, lng: -73.9825 }, reply_rate: 3 })
  b.addProfile({ id: B.id, name: 'BottomGuy', role: 'Bottom', age: 44, details: { body: 'Average' }, privacy: { hide_from_age_insights: true }, location: { lat: 40.7515, lng: -73.9825 } })
  b.addProfile({ id: C.id, name: 'ShyGuy', role: 'Top', age: 23, privacy: { hide_from_community_insights: true, video_off: true }, location: { lat: 40.7455, lng: -73.9885 } })
  for (const v of [A, B, C]) b.insert('profile_views', { viewer_id: v.id, viewed_id: ME.id, viewed_at: new Date().toISOString() })
  b.insert('likes', { from_user: A.id, to_user: ME.id })
  return b
}

test('privacy settings save to the server', async ({ browser }) => {
  const backend = seed()
  const { page, problems } = await openAs(browser, backend, ME)
  await page.getByText('Me', { exact: true }).last().click()
  await page.getByRole('button', { name: /Privacy settings/ }).click()
  await expect(page.getByRole('heading', { name: 'Privacy settings' })).toBeVisible()
  const me = () => backend.t('profiles').find(p => p.id === ME.id)!
  await page.getByRole('switch', { name: 'Stealth' }).click()
  await page.getByRole('switch', { name: 'Overnight' }).click()
  await page.getByRole('switch', { name: 'Age' }).first().click()
  await page.getByRole('switch', { name: 'Distance' }).click()
  await expect.poll(() => me().privacy).toMatchObject({ stealth: true, quiet_hours: true, hide_age: true, hide_distance: true })
  // Preview switch is the inverse of "show names in alerts"; discreet is the default
  await expect(page.getByRole('switch', { name: 'Preview' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('switch', { name: 'Preview' }).click()
  await expect.poll(() => me().notify_previews).toBe(true)
  // Time zone recorded for quiet hours
  await expect.poll(() => me().tz).toBe('America/Chicago')
  expect(problems).toEqual([])
})

test('startup lock asks for the PIN on open', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  await page.getByText('Me', { exact: true }).last().click()
  await page.getByRole('button', { name: /Privacy settings/ }).click()
  await page.getByText('Startup lock').click()
  await page.getByLabel('PIN').fill('2580'); await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('PIN').fill('2580'); await page.getByRole('button', { name: 'Turn on lock' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('he_app_lock'))).not.toBeNull()
  const stored = await page.evaluate(() => localStorage.getItem('he_app_lock'))
  expect(stored).not.toContain('2580') // only a salted hash is kept
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'App locked' })).toBeVisible()
  await page.getByLabel('PIN').fill('1111'); await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Wrong PIN')).toBeVisible()
  await page.getByLabel('PIN').fill('2580'); await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('dialog', { name: 'App locked' })).toHaveCount(0)
})

test('insights show who is into you, respecting opt-outs', async ({ browser }) => {
  const backend = seed()
  const { page, problems } = await openAs(browser, backend, ME)
  await page.getByText('Me', { exact: true }).last().click()
  await page.getByRole('button', { name: /Insights/ }).click()
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
  await expect(page.getByLabel('Reply score 8 out of 10')).toBeVisible()
  const roles = page.locator('section', { hasText: 'by role' })
  await expect(roles.getByText('Top')).toBeVisible()
  await expect(roles.getByText('50%').first()).toBeVisible()            // Top 1, Bottom 1 (ShyGuy opted out)
  const ages = page.locator('section', { hasText: 'By age' })
  await expect(ages.getByText('26-35')).toBeVisible()                   // TopGuy
  await expect(ages.getByText('18-25')).toBeVisible()                   // ShyGuy (only hid community)
  await expect(ages.getByText('36-45')).toHaveCount(0)                  // BottomGuy opted out of age insights
  await expect(page.getByText('Based on the 3 people')).toBeVisible()
  expect(problems).toEqual([])
})

test('profiles show reply rate; video button hidden when they turned video off', async ({ browser }) => {
  const backend = seed()
  // keys so a chat can open
  const { page } = await openAs(browser, backend, ME)
  await openProfile(page, 'TopGuy')
  await expect(page.getByText(/Replies selectively · 3\/10/)).toBeVisible()
  await page.getByLabel('Close profile').click()
  await openProfile(page, 'ShyGuy')
  await page.getByRole('button', { name: '💬 Message' }).click()
  await expect(page.getByText('end-to-end encrypted')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start video call' })).toHaveCount(0)
})
