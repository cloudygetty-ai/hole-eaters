import { test, expect } from '@playwright/test'
import { FakeBackend } from './fake-backend'
import { openAs, uid } from './helpers'

const ME = { id: uid(41) }

for (const device of [{ name: 'iPhone-size', width: 390, height: 664 }, { name: 'small phone', width: 360, height: 560 }]) {
  test(`Whore-izon: message box visible and usable (${device.name})`, async ({ browser }) => {
    const backend = new FakeBackend()
    backend.addProfile({ id: ME.id, name: 'MeTest' })
    const { page, problems } = await openAs(browser, backend, ME)
    await page.setViewportSize({ width: device.width, height: device.height })
    await page.getByText('Whore-izon', { exact: true }).last().click()
    const box = page.getByPlaceholder('say something filthy...')
    await expect(box).toBeVisible()
    // Not hidden behind the tab bar: the element actually under the box's center is the box
    const onTop = await box.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el })
    expect(onTop).toBe(true)
    await box.fill('hello Whore-izon')
    await box.press('Enter')
    await expect.poll(() => backend.t('global_messages').map(m => m.content)).toContain('hello Whore-izon')
    await expect(page.getByText('hello Whore-izon')).toBeVisible()
    expect(problems).toEqual([])
  })
}
