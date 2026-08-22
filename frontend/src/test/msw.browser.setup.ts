import { setupWorker } from 'msw/browser'
import { afterAll, afterEach, beforeAll } from 'vitest'

/**
 * The service worker every browser-tier spec talks through. Loaded by the
 * `browser` project in vitest.config.ts, so it installs whether or not a spec
 * asks for it — hermeticity that depends on remembering to opt in is not
 * hermeticity.
 *
 * Deliberately started with no handlers: `onUnhandledRequest: 'error'` then
 * means every spec must declare the world it wants, and a request nobody
 * handled fails the test rather than silently reaching real AWS.
 */
export const mswBrowserWorker = setupWorker()

beforeAll(async () => {
  await mswBrowserWorker.start({ onUnhandledRequest: 'error', quiet: true })
})

afterEach(() => {
  mswBrowserWorker.resetHandlers()
})

afterAll(() => {
  mswBrowserWorker.stop()
})
