import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid, GPS_PHOTO } from './helpers'

test('new person: setup → photo (location stripped) → map, one guest account, own folder', async ({ browser }) => {
  const backend = new FakeBackend()
  backend.addProfile({ id: uid(9), name: 'NeighborTest', location: { lat: 40.7515, lng: -73.9885 } })
  const NEW = { id: uid(10) }
  // Starts signed out; the guest session the app creates gets NEW's id
  const signups: string[] = []
  const { page, problems } = await openAs(browser, backend, NEW, { signedIn: false })
  page.on('request', r => { if (r.url().includes('/auth/v1/signup')) signups.push(r.url()) })

  await page.getByPlaceholder('Your name or handle').fill('SetupTest')
  await page.getByPlaceholder('Age (18+)').fill('30')
  for (let i = 0; i < 6; i++) await page.getByText('Continue →').click()

  await page.locator('input[type=file]').first().setInputFiles(GPS_PHOTO)
  await expect.poll(() => [...backend.files.keys()].filter(k => k.startsWith(`media/${NEW.id}/profile/`)).length).toBe(1)
  const [, photo] = [...backend.files.entries()].find(([k]) => k.startsWith(`media/${NEW.id}/profile/`))!
  expect(photo.bytes.includes(Buffer.from('Exif'))).toBe(false)           // GPS/EXIF gone
  expect(photo.bytes.includes(Buffer.from('GPS'))).toBe(false)

  await page.getByText('Continue →').click()
  await page.getByText('Enter the Map').click()
  await expect(page.getByText('Map', { exact: true }).last()).toBeVisible()
  await expect.poll(() => backend.t('profiles').find(p => p.id === NEW.id)?.name).toBe('SetupTest')
  expect(backend.t('profiles').find(p => p.id === NEW.id)?.photo_url).toContain(`/media/${NEW.id}/profile/`)
  expect(signups.length).toBeLessThanOrEqual(1)
  // An encryption key for chats was created for the new profile
  await expect.poll(() => backend.t('user_keys').filter(k => k.user_id === NEW.id).length).toBe(1)
  expect(problems).toEqual([])
})

test('under-18 can\'t get past the first step', async ({ browser }) => {
  const backend = new FakeBackend()
  const { page } = await openAs(browser, backend, { id: uid(11) })
  await page.getByPlaceholder('Your name or handle').fill('Kid')
  await page.getByPlaceholder('Age (18+)').fill('16')
  await expect(page.getByText('Continue →')).toBeDisabled()
})
