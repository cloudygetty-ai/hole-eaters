import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, openProfile, uid } from './helpers'

// Report and Block wherever you meet someone (1:1 chat, Whore-izon), and Unblock from Privacy settings.

const ME = { id: uid(51), email: 'me51@example.com' } // Whore-izon needs an account
const HIM = { id: uid(52) }

function seed() {
  const b = new FakeBackend()
  b.addProfile({ id: ME.id, name: 'MeTest', location: { lat: 40.7515, lng: -73.9885 } })
  b.addProfile({ id: HIM.id, name: 'HimTest', location: { lat: 40.7455, lng: -73.9825 } })
  return b
}

test('1:1 chat: report, then block, and the chat leaves the inbox', async ({ browser }) => {
  const backend = seed()
  backend.insert('matches', { user_a: ME.id, user_b: HIM.id })
  const { page, problems } = await openAs(browser, backend, ME)
  await openProfile(page, 'HimTest')
  await page.getByRole('button', { name: '💬 Message' }).click()
  await expect(page.getByText('end-to-end encrypted').first()).toBeVisible()

  await page.getByRole('button', { name: 'Report or block HimTest' }).click()
  await page.getByRole('button', { name: '🚩 Report HimTest' }).click()
  await expect(page.getByText("our moderators can't read this one")).toBeVisible()
  await page.getByLabel('Why are you reporting HimTest?').selectOption('harassment')
  await page.getByLabel('Additional details').fill('kept messaging after I said no')
  await page.getByRole('button', { name: 'Submit Report' }).click()
  await expect(page.getByText('Report submitted')).toBeVisible()
  expect(backend.t('reports')).toHaveLength(1)
  expect(backend.t('reports')[0]).toMatchObject({
    reporter_id: ME.id, reported_id: HIM.id, reason: 'harassment',
    details: 'Reported from a 1:1 chat · kept messaging after I said no',
  })

  await page.getByRole('button', { name: '🚫 Block HimTest too' }).click()
  await expect.poll(() => backend.t('blocks').map(b => b.blocked)).toEqual([HIM.id])
  // Blocking leaves the chat; the conversation is gone from the inbox
  await page.getByText('Inbox', { exact: true }).last().click()
  await expect(page.getByText('No conversations yet.')).toBeVisible()
  await expect(page.getByText('HimTest')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('1:1 chat: block asks first, then leaves the chat', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  await openProfile(page, 'HimTest')
  await page.getByRole('button', { name: '💬 Message' }).click()
  await page.getByRole('button', { name: 'Report or block HimTest' }).click()
  await page.getByRole('button', { name: '🚫 Block HimTest' }).click()
  await expect(page.getByText('Block HimTest?')).toBeVisible()
  expect(backend.t('blocks')).toHaveLength(0)
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await expect.poll(() => backend.t('blocks').map(b => b.blocked)).toEqual([HIM.id])
  await expect(page.getByPlaceholder('Say something...')).toHaveCount(0)
})

test('Whore-izon: report from a name includes the message, block hides their posts', async ({ browser }) => {
  const backend = seed()
  backend.insert('global_messages', { sender_id: HIM.id, content: 'buy followers at my site', media_url: null, media_type: null })
  backend.insert('global_messages', { sender_id: null, content: '👻 anonymous hello', media_url: null, media_type: null })
  const { page, problems } = await openAs(browser, backend, ME)
  await page.getByText('Whore-izon', { exact: true }).last().click()
  await expect(page.getByText('buy followers at my site')).toBeVisible()
  // Ghost posts have no sender to report or block
  await expect(page.getByRole('button', { name: /report or block/ })).toHaveCount(1)

  await page.getByRole('button', { name: 'HimTest: report or block' }).click()
  await page.getByRole('button', { name: '🚩 Report HimTest' }).click()
  await page.getByLabel('Why are you reporting HimTest?').selectOption('spam')
  await page.getByRole('button', { name: 'Submit Report' }).click()
  await expect(page.getByText('Report submitted')).toBeVisible()
  expect(backend.t('reports')[0]).toMatchObject({
    reporter_id: ME.id, reported_id: HIM.id, reason: 'spam',
    details: 'Reported from Whore-izon. Their message: "buy followers at my site"',
  })
  await page.getByRole('button', { name: '🚫 Block HimTest too' }).click()
  await expect.poll(() => backend.t('blocks').map(b => b.blocked)).toEqual([HIM.id])
  await expect(page.getByText('buy followers at my site')).toHaveCount(0)
  await expect(page.getByText('anonymous hello')).toBeVisible()
  expect(problems).toEqual([])
})

test('unblock from Privacy settings sticks, even with an old copy of the list on the phone', async ({ browser }) => {
  const backend = seed()
  backend.insert('blocks', { blocker: ME.id, blocked: HIM.id })
  const { page, problems } = await openAs(browser, backend, ME)
  const openBlocked = async () => {
    await page.getByText('Me', { exact: true }).last().click()
    await page.getByRole('button', { name: /Privacy settings/ }).click()
    await page.getByRole('button', { name: /Blocked people/ }).click()
  }
  await openBlocked()
  await expect(page.getByRole('dialog', { name: 'Blocked people' }).getByText('HimTest')).toBeVisible()
  await page.getByRole('button', { name: 'Unblock HimTest' }).click()
  await expect(page.getByText('Unblocked', { exact: true })).toBeVisible()
  await expect.poll(() => backend.t('blocks')).toHaveLength(0)

  // A phone that still has the old list must not put the block back
  await page.evaluate(id => localStorage.setItem('he_blocked_ids', JSON.stringify([id])), HIM.id)
  await page.reload()
  await page.getByText('Nearby', { exact: true }).last().click()
  await expect(page.getByText('HimTest', { exact: true }).first()).toBeVisible()
  expect(backend.t('blocks')).toHaveLength(0)
  expect(problems).toEqual([])
})

test('blocks saved only on the phone by older versions are uploaded once', async ({ browser }) => {
  const backend = seed()
  const { page } = await openAs(browser, backend, ME)
  // Let the first load finish its own sync, so it can't overwrite the old copy we plant next
  await expect.poll(() => page.evaluate(() => localStorage.getItem('he_blocks_synced'))).toBe('1')
  await page.evaluate(id => { localStorage.removeItem('he_blocks_synced'); localStorage.setItem('he_blocked_ids', JSON.stringify([id])) }, HIM.id)
  await page.reload()
  await expect.poll(() => backend.t('blocks').map(b => b.blocked)).toEqual([HIM.id])
  await expect.poll(() => page.evaluate(() => localStorage.getItem('he_blocks_synced'))).toBe('1')
})
