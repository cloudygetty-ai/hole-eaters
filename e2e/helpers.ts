import { readFileSync } from 'node:fs'
import { expect, type Browser, type Page } from '@playwright/test'
import { FakeBackend, type FakeUser } from './fake-backend'

/** The production Content-Security-Policy from vercel.json, so tests run under the same rules. */
export const CSP: string = (JSON.parse(readFileSync('vercel.json', 'utf8')).headers as { headers: { key: string; value: string }[] }[])
  .flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')!.value

export const GPS_PHOTO = 'e2e/fixtures/gps-photo.jpg' // phone-style JPEG with EXIF GPS (40°44'54"N 73°59'08"W)

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Opens the app in its own browser context as `user`, with CSP enforced and console errors collected. */
export async function openAs(browser: Browser, backend: FakeBackend, user: FakeUser | null, opts: { path?: string; signedIn?: boolean } = {}) {
  const path = opts.path ?? '/app'
  const context = await browser.newContext()
  await backend.attach(context, user, { csp: CSP, signedIn: opts.signedIn })
  const page = await context.newPage()
  const problems: string[] = []
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) problems.push(`csp: ${m.text()}`) })
  await page.goto(path)
  return { context, page, problems }
}

/** Open someone's profile drawer from the Nearby list (map pins can overlap). */
export async function openProfile(page: Page, name: string) {
  await page.getByText('Nearby', { exact: true }).last().click()
  await page.getByText(name, { exact: true }).first().click()
  await expect(page.getByRole('button', { name: '💬 Message' })).toBeVisible()
}

/** Contains bytes of `needle` anywhere (used to prove plaintext never reaches the server). */
export const containsText = (hay: unknown, needle: string) => JSON.stringify(hay).includes(needle)
