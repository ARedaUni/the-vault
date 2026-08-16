import { defineConfig } from '@playwright/test'

const isCI = Boolean(process.env.CI)

/**
 * The contract suite: the deliberate opposite of playwright.config.ts.
 *
 * These specs talk to the deployed API on purpose, so they are kept out of CI —
 * a build must not go red because CloudFront hiccupped. Run them after a deploy
 * or whenever the backend changes:
 *
 *   npm run test:contract
 *
 * No browser projects and no webServer: there is no UI here, only HTTP. The
 * requests still go through the Vite proxy at baseURL, which is what keeps the
 * path identical to the one the browser uses.
 */
export default defineConfig({
  testDir: './e2e/contract',
  fullyParallel: true,
  forbidOnly: isCI,
  // No retries: a flaky contract check is itself the finding.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
