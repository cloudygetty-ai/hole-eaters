import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: the real built app in Chromium, talking to an in-memory fake Supabase
// (e2e/fake-backend.ts). Run: pnpm test:e2e
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    ...devices['Pixel 7'],
    geolocation: { latitude: 40.7484, longitude: -73.9857 },
    timezoneId: 'America/Chicago',
    permissions: ['geolocation'],
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4321 --strictPort',
    url: 'http://localhost:4321/app',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
