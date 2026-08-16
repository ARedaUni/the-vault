import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

/**
 * The app suite: hermetic, and the only Playwright run in CI.
 *
 * Every request is answered by the catalogue fake, so a red build means this
 * frontend is broken — never that AWS was slow or redeployed. The live contract
 * check lives in playwright.contract.config.ts and runs on demand.
 */
export default defineConfig({
  testDir: './e2e/app',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // One worker in CI so a test that only passes in isolation is caught here
  // rather than in production.
  workers: isCI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['blob'], ['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['Pixel 7'] },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
})
