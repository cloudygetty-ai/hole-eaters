import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid } from './helpers'

const ME = { id: uid(71) }
const HERE = { lat: 40.7484, lng: -73.9857 }
const HOUR = 3_600_000
const iso = (ms: number) => new Date(Date.now() + ms).toISOString()

// Alone on the map (one stale pin that isn't online), one spot, two nights there: one later, one live with its room open.
function seed({ admin = false } = {}) {
  const b = new FakeBackend()
  b.addProfile({ id: ME.id, name: 'EarlyBird', location: HERE })
  b.addProfile({ id: uid(72), name: 'StalePin', online: false, location: { lat: HERE.lat + 0.003, lng: HERE.lng + 0.003 } })
  const spot = b.insert('spots', { kind: 'bar', name: 'Test Venue Bar', lat: HERE.lat + 0.001, lng: HERE.lng, source: 'osm', status: 'approved' })
  const room = b.insert('pulse_rooms', { name: 'Late Room Night', color: '#B18A55', creator_id: uid(99), creator_name: 'Venue', member_ids: [], expires_at: iso(3 * HOUR) })
  const nights = [
    { id: 'night-live', title: 'Late Room Night', starts_at: iso(-0.5 * HOUR), ends_at: iso(3 * HOUR), live: true, room_id: room.id },
    { id: 'night-later', title: 'Thursday Social', starts_at: iso(30 * HOUR), ends_at: iso(34 * HOUR), live: false, room_id: null },
  ].map(n => ({ ...n, spot_id: spot.id, spot_name: spot.name, spot_kind: 'bar', lat: spot.lat, lng: spot.lng }))
  const going = new Set<string>()
  const watches = new Set<string>()
  b.rpc.is_admin = () => admin
  b.rpc.my_invite_stats = () => ({ code: 'early1', invited: 1 })
  b.rpc.my_map_watch = (_a, user) => watches.has(user!)
  b.rpc.set_map_watch = (_a, user) => { watches.add(user!); return true }
  b.rpc.clear_map_watch = (_a, user) => { watches.delete(user!); return null }
  b.rpc.upcoming_nights = (_a, user) => nights.map(n => ({ ...n, going: going.has(n.id) ? 1 : 0, i_am_going: going.has(n.id) && !!user }))
  b.rpc.rsvp_night = a => { if (a.p_going) going.add(a.p_night); else going.delete(a.p_night); return going.has(a.p_night) ? 1 : 0 }
  b.rpc.add_night = a => { nights.push({ ...nights[1], id: 'night-new', title: a.p_title, starts_at: a.p_starts_at, ends_at: a.p_ends_at }); return 'night-new' }
  return { b, watches }
}

test('empty map: invite progress, ping me when someone shows up, and nights with their rooms', async ({ browser }) => {
  const { b, watches } = seed()
  const { context, page, problems } = await openAs(browser, b, ME, { stubMap: true })
  // Notifications already on, so the switch turns on without a browser prompt.
  // Headless test browsers differ on web push support, so act as a phone that has it.
  await context.addInitScript(() => {
    if (!('PushManager' in window)) Object.defineProperty(window, 'PushManager', { value: class PushManager {}, configurable: true })
    if (!('Notification' in window)) Object.defineProperty(window, 'Notification', { value: class Notification { static requestPermission = async () => 'granted' }, configurable: true })
    Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true })
  })
  await page.reload()

  // Folded by default in tests; unfold it
  await page.getByRole('button', { name: "It's early here. Show invite and nights" }).click({ timeout: 45_000 })
  const card = page.getByRole('region', { name: "It's early here" })
  await expect(card.getByText("Invite 3 friends and we'll ping you when someone shows up.")).toBeVisible()
  await expect(card.getByText('1 of 3 joined')).toBeVisible()

  await card.getByRole('switch', { name: 'Ping me when someone shows up' }).click()
  await expect(card.getByRole('switch', { name: 'Ping me when someone shows up' })).toHaveAttribute('aria-checked', 'true')
  await expect(card.getByText("We'll ping you once when someone shows up nearby.")).toBeVisible()
  const set = b.rpcCalls.find(c => c.name === 'set_map_watch')!
  expect(Math.abs(set.args.p_lat - HERE.lat)).toBeLessThan(0.01)
  expect(watches.has(ME.id)).toBe(true)

  // Next nights, soonest first; "I'm going" counts and promises the start-of-night ping
  await card.getByRole('button', { name: /Thursday Social/ }).click()
  const later = page.getByRole('dialog', { name: 'Thursday Social' })
  await later.getByRole('button', { name: "🙋 I'm going" }).click()
  await expect(later.getByRole('button', { name: '✓ Going · Undo' })).toBeVisible()
  await expect(later.getByText('1 going')).toBeVisible()
  await expect(later.getByText("We'll ping you when it starts.")).toBeVisible()
  await later.getByRole('button', { name: 'Close' }).click()

  // Folding the card sticks; the live night's tag on the map opens its room
  await card.getByRole('button', { name: 'Hide' }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: /^Night: Late Room Night/ }).click()
  await page.getByRole('dialog', { name: 'Late Room Night' }).getByRole('button', { name: '📡 Join the room' }).click()
  await expect(page.getByPlaceholder('Message the room…')).toBeVisible()
  expect(b.rpcCalls.some(c => c.name === 'join_pulse_room')).toBe(true)
  expect(problems).toEqual([])
})

test('nights: an admin adds one from the spot sheet', async ({ browser }) => {
  const { b } = seed({ admin: true })
  const { page } = await openAs(browser, b, ME, { stubMap: true })
  await page.getByRole('button', { name: 'Bar: Test Venue Bar' }).click({ timeout: 45_000 })
  const sheet = page.getByRole('dialog', { name: 'Test Venue Bar' })
  const nights = sheet.getByRole('region', { name: 'Nights here' })
  await expect(nights.getByText('Thursday Social')).toBeVisible()
  await nights.getByRole('button', { name: '＋ Add a night' }).click()
  await nights.getByLabel('Night name').fill('Sunday Tea Dance')
  await nights.getByRole('button', { name: 'Add night' }).click()
  await expect.poll(() => b.rpcCalls.find(c => c.name === 'add_night')?.args.p_title).toBe('Sunday Tea Dance')
  await expect(nights.getByText('Sunday Tea Dance')).toBeVisible()
})

test('a busy map shows no empty-map card', async ({ browser }) => {
  const { b } = seed()
  b.addProfile({ id: uid(73), name: 'OnlineNow', location: { lat: HERE.lat + 0.002, lng: HERE.lng } })
  const { page } = await openAs(browser, b, ME, { stubMap: true })
  await expect(page.getByRole('button', { name: /OnlineNow/ }).or(page.getByText('OnlineNow')).first()).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: "It's early here. Show invite and nights" })).toHaveCount(0)
})
