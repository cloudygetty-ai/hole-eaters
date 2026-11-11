import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid } from './helpers'

const HOST = { id: uid(61), email: 'host61@example.com' }
const GUEST = { id: uid(62) } // anonymous session: rooms are open to everyone

test('Pulse Rooms: a room one person starts is visible to others, and messages go both ways', async ({ browser }) => {
  const backend = new FakeBackend()
  backend.addProfile({ id: HOST.id, name: 'HostTest' })
  backend.addProfile({ id: GUEST.id, name: 'GuestTest' })

  const host = await openAs(browser, backend, HOST, { stubMap: true })
  await host.page.getByRole('button', { name: /Start Pulse Room/ }).click({ timeout: 45_000 })
  await host.page.getByRole('button', { name: '📡 Start Room' }).click()
  await expect.poll(() => backend.t('pulse_rooms').map(r => r.name)).toEqual(["HostTest's Room"])
  const hostBox = host.page.getByPlaceholder('Message the room…')
  await hostBox.fill('anyone around?')
  await hostBox.press('Enter')
  await expect(host.page.getByText('anyone around?')).toBeVisible()

  // The guest never created this room: it has to arrive from the backend
  const guest = await openAs(browser, backend, GUEST, { stubMap: true })
  await guest.page.getByRole('navigation', { name: 'Main navigation' }).getByText('Me', { exact: true }).click()
  await guest.page.getByText("HostTest's Room").click()
  await expect(guest.page.getByText('anyone around?')).toBeVisible()
  const guestBox = guest.page.getByPlaceholder('Message the room…')
  await guestBox.fill('right here')
  await guestBox.press('Enter')

  await expect(host.page.getByText('right here')).toBeVisible()
  expect(backend.rpcCalls.some(c => c.name === 'join_pulse_room' && c.user === GUEST.id)).toBe(true)
})
