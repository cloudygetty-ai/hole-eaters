import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, openProfile, uid, containsText, GPS_PHOTO } from './helpers'

// Two real browsers, one shared fake server: Alex messages Ben. The server must only ever see ciphertext.

const ALEX = { id: uid(1) }, BEN = { id: uid(2) }, CAL = { id: uid(3) }

function seed() {
  const b = new FakeBackend()
  b.addProfile({ id: ALEX.id, name: 'AlexTest', location: { lat: 40.7515, lng: -73.9885 } })
  b.addProfile({ id: BEN.id, name: 'BenTest', location: { lat: 40.7455, lng: -73.9825 } })
  b.addProfile({ id: CAL.id, name: 'CalTest', location: { lat: 40.7515, lng: -73.9825 } })
  return b
}

async function chatWith(page: import('@playwright/test').Page, name: string) {
  await openProfile(page, name)
  await page.getByRole('button', { name: '💬 Message' }).click()
  await expect(page.getByText('end-to-end encrypted')).toBeVisible()
}

test('text, sticker and photo are end-to-end encrypted between two people', async ({ browser }) => {
  const backend = seed()
  const ben = await openAs(browser, backend, BEN)          // Ben opens the app once → his device key exists
  await expect.poll(() => backend.t('user_keys').filter(k => k.user_id === BEN.id).length).toBe(1)

  const alex = await openAs(browser, backend, ALEX)
  await expect.poll(() => backend.t('user_keys').filter(k => k.user_id === ALEX.id).length).toBe(1)
  // Only public keys are ever uploaded
  for (const k of backend.t('user_keys')) expect(k.public_key.d).toBeUndefined()

  await chatWith(alex.page, 'BenTest')
  const SECRET = 'meet me at the side door 9pm'
  await alex.page.getByPlaceholder('Say something...').fill(SECRET)
  await alex.page.getByPlaceholder('Say something...').press('Enter')
  await expect(alex.page.getByText(SECRET)).toBeVisible()

  // Server copy: no plaintext, only an envelope wrapped for both people's devices
  const row = backend.t('messages').at(-1)!
  expect(row.content).toBe('')
  expect(row.media_url).toBeNull()
  expect(row.enc?.v).toBe(1)
  expect(containsText(backend.tables, SECRET)).toBe(false)
  expect(Object.keys(row.enc.k).length).toBe(2)

  // Sticker
  await alex.page.getByRole('button', { name: 'Send a sticker' }).click()
  await alex.page.locator('img[src^="/stickers/"]').first().click()
  await expect.poll(() => backend.t('messages').length).toBe(2)
  expect(backend.t('messages')[1].media_url).toBeNull()

  // Photo with GPS → stripped, then encrypted before upload
  await alex.page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles(GPS_PHOTO)
  await alex.page.getByPlaceholder('Say something...').press('Enter')
  await expect.poll(() => [...backend.files.keys()].filter(k => k.startsWith('chat/')).length).toBe(1)
  const [path, file] = [...backend.files.entries()].find(([k]) => k.startsWith('chat/'))!
  expect(path).toMatch(new RegExp(`^chat/[0-9a-f-]{36}/${ALEX.id}/`))
  expect(file.type).toBe('application/octet-stream')
  expect(file.bytes.subarray(0, 2).toString('hex')).not.toBe('ffd8')     // not a readable JPEG
  expect(file.bytes.includes(Buffer.from('Exif'))).toBe(false)
  await expect(alex.page.locator('img[src^="blob:"]').last()).toBeVisible()

  // Ben reads all three
  await chatWith(ben.page, 'AlexTest')
  await expect(ben.page.getByText(SECRET)).toBeVisible()
  await expect(ben.page.locator('img[src^="/stickers/"]').last()).toBeVisible()
  const photo = ben.page.locator('img[src^="blob:"]').last()
  await expect(photo).toBeVisible()
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100)

  // Someone else holding the same rows can't read them (no key for his device)
  const cal = await openAs(browser, backend, CAL)
  await expect.poll(() => backend.t('user_keys').filter(k => k.user_id === CAL.id).length).toBe(1)
  const match = backend.t('matches')[0]
  backend.t('matches').push({ ...match, id: match.id, user_a: CAL.id < ALEX.id ? CAL.id : ALEX.id, user_b: CAL.id < ALEX.id ? ALEX.id : CAL.id }) // pretend he got access
  await chatWith(cal.page, 'AlexTest')
  await expect(cal.page.getByText('🔒 Sent before this device was set up').first()).toBeVisible()
  await expect(cal.page.getByText(SECRET)).toHaveCount(0)

  for (const p of [alex, ben, cal]) expect(p.problems).toEqual([])
})

test('messaging someone who has no device key yet is refused, not sent in plaintext', async ({ browser }) => {
  const backend = seed()
  const alex = await openAs(browser, backend, ALEX)
  await chatWith(alex.page, 'BenTest') // Ben never opened the new app
  await alex.page.getByPlaceholder('Say something...').fill('hello?')
  await alex.page.getByPlaceholder('Say something...').press('Enter')
  await expect(alex.page.getByText(/BenTest needs to open Hole Eaters once/)).toBeVisible()
  expect(backend.t('messages')).toHaveLength(0)
})
