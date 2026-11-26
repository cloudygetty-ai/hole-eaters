import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid, GPS_PHOTO } from './helpers'

test('new person: two screens → map, one guest account carrying ad attribution', async ({ browser }) => {
  const backend = new FakeBackend()
  backend.addProfile({ id: uid(9), name: 'NeighborTest', location: { lat: 40.7515, lng: -73.9885 } })
  const NEW = { id: uid(10) }
  const signups: { url: string; body: string }[] = []
  const { page, problems } = await openAs(browser, backend, NEW, { signedIn: false, path: '/app?utm_source=trafficjunky&utm_content=v3-distance' })
  page.on('request', r => { if (r.url().includes('/auth/v1/signup')) signups.push({ url: r.url(), body: r.postData() ?? '' }) })

  await expect(page.getByLabel('Step 1 of 2')).toBeVisible()
  await page.getByPlaceholder('Your name or handle').fill('SetupTest')
  await page.getByPlaceholder('Age (18+)').fill('30')
  await page.getByRole('button', { name: /18\+ — let me in/ }).click()
  await expect(page.getByText('around you.')).toBeVisible()
  await page.getByRole('button', { name: 'Turn on location' }).click()

  await expect(page.getByText('Map', { exact: true }).last()).toBeVisible()
  await expect.poll(() => backend.t('profiles').find(p => p.id === NEW.id)?.name).toBe('SetupTest')
  expect(backend.t('profiles').find(p => p.id === NEW.id)?.age).toBe(30)
  expect(signups.length).toBe(1)
  expect(signups[0].body).toContain('trafficjunky')                     // first-touch UTM → user_metadata
  expect(signups[0].body).toContain('v3-distance')
  await expect(page.getByText('Location is off')).toHaveCount(0)        // allowed → no "off" banner
  // An encryption key for chats was created for the new profile
  await expect.poll(() => backend.t('user_keys').filter(k => k.user_id === NEW.id).length).toBe(1)
  expect(problems).toEqual([])
})

test('"Not now" skips the OS location prompt and offers it from the map', async ({ browser }) => {
  const backend = new FakeBackend()
  const { page } = await openAs(browser, backend, { id: uid(12) }, { signedIn: false })
  await page.addInitScript(() => {
    // Count geolocation calls made by the app before the person opts in
    const w = window as unknown as { __geoCalls: number }; w.__geoCalls = 0
    const g = navigator.geolocation, get = g.getCurrentPosition.bind(g), watch = g.watchPosition.bind(g)
    g.getCurrentPosition = (...a: Parameters<typeof get>) => { w.__geoCalls++; return get(...a) }
    g.watchPosition = (...a: Parameters<typeof watch>) => { w.__geoCalls++; return watch(...a) }
  })
  await page.reload()
  await page.getByPlaceholder('Your name or handle').fill('LaterTest')
  await page.getByPlaceholder('Age (18+)').fill('25')
  await page.getByRole('button', { name: /18\+ — let me in/ }).click()
  await page.getByRole('button', { name: /Not now/ }).click()

  await expect(page.getByText('Location is off. Turn it on to see who’s near.')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0)
  await page.getByRole('button', { name: 'Turn on', exact: true }).click()
  await expect(page.getByText('Location is off. Turn it on to see who’s near.')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBeGreaterThan(0)
})

test('photo and eat-role survey moved to the profile editor: GPS stripped, answers saved', async ({ browser }) => {
  const backend = new FakeBackend()
  const ME = { id: uid(13) }
  backend.addProfile({ id: ME.id, name: 'EditorTest' })
  const { page, problems } = await openAs(browser, backend, ME)
  await page.getByText('Me', { exact: true }).last().click()
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByRole('button', { name: 'Both', exact: true }).click()
  await page.getByRole('button', { name: 'Face-sitting', exact: true }).click()

  // The editor's photo input (the Me screen also has a hidden cover-photo input)
  await page.locator('input[type=file][accept*="image/jpeg"]').last().setInputFiles(GPS_PHOTO)
  await expect.poll(() => [...backend.files.keys()].filter(k => k.startsWith(`media/${ME.id}/profile/`)).length).toBe(1)
  const [, photo] = [...backend.files.entries()].find(([k]) => k.startsWith(`media/${ME.id}/profile/`))!
  expect(photo.bytes.includes(Buffer.from('Exif'))).toBe(false)           // GPS/EXIF gone
  expect(photo.bytes.includes(Buffer.from('GPS'))).toBe(false)

  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect.poll(() => backend.t('profiles').find(p => p.id === ME.id)?.photo_url ?? '').toContain(`/media/${ME.id}/profile/`)
  const saved = backend.t('profiles').find(p => p.id === ME.id)?.details as { eat_role?: string; eat_positions?: string[] } | undefined
  expect(saved?.eat_role).toBe('Both')
  expect(saved?.eat_positions).toEqual(['Face-sitting'])
  expect(problems).toEqual([])
})

test('under-18 can\'t get past the first step', async ({ browser }) => {
  const backend = new FakeBackend()
  const { page } = await openAs(browser, backend, { id: uid(11) })
  await page.getByPlaceholder('Your name or handle').fill('Kid')
  await page.getByPlaceholder('Age (18+)').fill('16')
  await expect(page.getByRole('button', { name: /18\+ — let me in/ })).toBeDisabled()
  await expect(page.getByText('Hole Eaters is for adults 18 and over.')).toBeVisible()
})
