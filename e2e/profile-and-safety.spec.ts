import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, openProfile, uid } from './helpers'

const ME = { id: uid(21) }, HIM = { id: uid(22) }

function seed() {
  const b = new FakeBackend()
  b.addProfile({ id: ME.id, name: 'MeTest', location: { lat: 40.7515, lng: -73.9885 } })
  b.addProfile({ id: HIM.id, name: 'HimTest', location: { lat: 40.7455, lng: -73.9825 } })
  // We've both messaged, so reviews are allowed
  const m = b.insert('matches', { user_a: ME.id, user_b: HIM.id })
  b.insert('messages', { match_id: m.id, sender_id: ME.id, content: '', enc: null })
  b.insert('messages', { match_id: m.id, sender_id: HIM.id, content: '', enc: null })
  return b
}

test('review + flake scale: post, phone numbers blocked, badge updates', async ({ browser }) => {
  const backend = seed()
  const { page, problems } = await openAs(browser, backend, ME)
  await openProfile(page, 'HimTest')
  await page.getByRole('button', { name: 'reviews', exact: true }).click()
  await page.getByRole('button', { name: '⏰ Showed up late' }).click()
  await page.getByRole('button', { name: '4 stars' }).click()
  await page.getByRole('button', { name: 'Respectful', exact: true }).click()
  await page.getByPlaceholder('Anything else? (optional)').fill('text me on 555-123-4567')
  await expect(page.getByText('No phone numbers or links in reviews.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Post review' })).toBeDisabled()
  await page.getByPlaceholder('Anything else? (optional)').fill('A bit late but worth it')
  await page.getByRole('button', { name: 'Post review' }).click()
  await expect.poll(() => backend.t('reviews').length).toBe(1)
  expect(backend.t('reviews')[0]).toMatchObject({ reviewer_id: ME.id, reviewee_id: HIM.id, met: 'late', rating: 4, tags: ['Respectful'] })
  await expect(page.getByText('Flake scale')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update review' })).toBeVisible()
  expect(problems).toEqual([])
})

test('Ghost Mode and discreet alerts are saved to the server', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  await page.getByText('Me', { exact: true }).last().click()
  // Discreet by default
  await expect(page.getByText('Lock screen just says "You have new activity"')).toBeVisible()
  await page.getByRole('button', { name: 'Show names in alerts' }).click()
  await expect.poll(() => backend.t('profiles').find(p => p.id === ME.id)?.notify_previews).toBe(true)
  await page.getByRole('button', { name: 'Enable Ghost Mode' }).click()
  await expect.poll(() => backend.t('profiles').find(p => p.id === ME.id)?.ghost).toBe(true)
})

test('blocking is saved to the server and hides him', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  await openProfile(page, 'HimTest')
  await page.getByRole('button', { name: 'report', exact: true }).click()
  await page.getByRole('button', { name: '🚫 Block User' }).click()
  await expect.poll(() => backend.t('blocks').map(b => b.blocked)).toEqual([HIM.id])
})

test('injected scripts never run (CSP), user text is shown as text', async ({ browser }) => {
  const backend = seed()
  backend.t('profiles').find(p => p.id === HIM.id)!.name = '<img src=x onerror="window.__pwned=1">'
  backend.t('profiles').find(p => p.id === HIM.id)!.bio = '<script>window.__pwned=2</script>'
  const { page } = await openAs(browser, backend, ME)
  await page.getByText('Nearby', { exact: true }).last().click()
  await expect(page.getByText('<img src=x onerror="window.__pwned=1">').first()).toBeVisible()  // rendered as plain text
  const ran = await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__pwned=3">')
    const s = document.createElement('script'); s.textContent = 'window.__pwned=4'; document.body.appendChild(s)
    return new Promise(r => setTimeout(() => r((window as unknown as { __pwned?: number }).__pwned ?? null), 500))
  })
  expect(ran).toBeNull()
})

test('landing page: no inline scripts, returning users go straight to the app', async ({ browser }) => {
  const backend = seed()
  const out = await openAs(browser, backend, null, { path: '/' })
  await expect(out.page.getByText('No app store needed')).toBeVisible()
  expect(out.problems).toEqual([])
  const back = await openAs(browser, backend, ME, { path: '/' })
  await expect(back.page).toHaveURL(/\/app/)
})
