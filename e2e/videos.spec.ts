import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid } from './helpers'

const ME = { id: uid(51), email: 'me51@example.com' } // posting videos needs an account

for (const device of [{ name: 'iPhone-size', width: 390, height: 664 }, { name: 'small phone', width: 360, height: 560 }]) {
  test(`Videos: Post button is not hidden behind the tab bar (${device.name})`, async ({ browser }) => {
    const backend = new FakeBackend()
    backend.addProfile({ id: ME.id, name: 'MeTest' })
    const { page } = await openAs(browser, backend, ME)
    await page.setViewportSize({ width: device.width, height: device.height })
    await page.getByRole('navigation', { name: 'Main navigation' }).getByText('Videos', { exact: true }).click()
    const post = page.getByRole('button', { name: 'Post a video' })
    await expect(post).toBeVisible()
    // The element actually under the button's center is the button, so a tap reaches it
    const onTop = await post.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el })
    expect(onTop).toBe(true)
    await post.click()
    await expect(page.getByRole('dialog', { name: 'Post a video' })).toBeVisible()
  })
}
