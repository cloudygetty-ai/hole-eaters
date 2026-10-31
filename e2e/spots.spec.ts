import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid } from './helpers'

const ME = { id: uid(41) }
const HERE = { lat: 40.7484, lng: -73.9857 }

function seed() {
  const b = new FakeBackend()
  b.addProfile({ id: ME.id, name: 'SpotTester', location: HERE })
  b.insert('spots', { kind: 'bar', name: 'Test Venue Bar', lat: HERE.lat + 0.001, lng: HERE.lng, source: 'osm', status: 'approved', website: 'https://example.com/', description: 'Hours: Mo-Su 16:00-04:00' })
  b.insert('spots', { kind: 'park', name: 'Secret Pending Park', lat: HERE.lat - 0.001, lng: HERE.lng, source: 'community', status: 'pending', created_by: uid(99) })
  return b
}

test('spots on the map: venue sheet, check in, vote, report; others\' pending spots stay hidden', async ({ browser }) => {
  const backend = seed()
  const { page, problems } = await openAs(browser, backend, ME, { stubMap: true })
  const pin = page.getByRole('button', { name: 'Bar: Test Venue Bar' })
  await expect(pin).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: 'Park: Secret Pending Park' })).toHaveCount(0)
  await pin.click()
  const sheet = page.getByRole('dialog', { name: 'Test Venue Bar' })
  await expect(sheet.getByText('Venue from OpenStreetMap')).toBeVisible()
  await expect(sheet.getByRole('link', { name: '🌐 Website' })).toHaveAttribute('rel', /noopener/)
  await sheet.getByRole('button', { name: "📍 I'm here" }).click()
  await expect(sheet.getByText('1 here now')).toBeVisible()
  await sheet.getByRole('button', { name: '👍 Still active' }).click()
  await expect.poll(() => backend.t('spot_votes').map(v => v.active)).toEqual([true])
  await sheet.getByRole('button', { name: '⚑ Report this spot' }).click()
  await sheet.getByRole('button', { name: 'Near kids or a school' }).click()
  await expect.poll(() => backend.t('spot_reports').map(r => r.reason)).toEqual(['near_kids'])
  await expect(sheet.getByText('an admin will take a look')).toBeVisible()
  expect(problems).toEqual([])
})

test('add a spot: pin at map centre, contact info blocked, sent for review', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME, { stubMap: true })
  await expect(page.getByRole('button', { name: 'Bar: Test Venue Bar' })).toBeVisible({ timeout: 45_000 })
  await page.getByRole('button', { name: 'Add a spot' }).click()
  await page.getByRole('button', { name: 'Pin here' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add a spot' })
  await sheet.getByRole('radio', { name: '🌳 Park' }).click()
  await sheet.getByLabel('Spot name').fill('Ramble north trail')
  await sheet.getByLabel('Tips').fill('text me 555-123-4567')
  await expect(sheet.getByText('No phone numbers or links in spots.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Send for review' })).toBeDisabled()
  await sheet.getByLabel('Tips').fill('After 9pm, past the bridge')
  await sheet.getByRole('button', { name: 'Send for review' }).click()
  await expect.poll(() => backend.t('spots').filter(s => s.created_by === ME.id).length).toBe(1)
  const added = backend.t('spots').find(s => s.created_by === ME.id)!
  expect(added).toMatchObject({ kind: 'park', name: 'Ramble north trail', description: 'After 9pm, past the bridge', status: 'pending' })
  expect(Math.abs(added.lat - HERE.lat)).toBeLessThan(0.01)
  // My own pending spot shows (dimmed) after the reload
  await expect(page.getByRole('button', { name: 'Park: Ramble north trail' })).toBeVisible()
})
