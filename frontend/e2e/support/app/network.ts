import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import type { RequestHandler } from 'msw'

/**
 * Drives the app's MSW handlers from Playwright, so both hermetic tiers answer
 * from the one definition of the fake API. The browser tier installs the
 * handlers in a service worker; here they run in the test process and
 * `page.route` carries their responses into the browser.
 *
 * The routing rules make the suite provably offline:
 * - anything leaving the dev server is aborted, so a stub that quietly stopped
 *   covering some request becomes a failing test rather than a call to AWS;
 * - `/api` and `/media` requests no handler matched are aborted for the same
 *   reason — the dev server would proxy them straight to AWS;
 * - everything else on localhost continues to the dev server, which owns the
 *   app's own modules and assets.
 */
export const routeThroughHandlers = async (
  page: Page,
  handlers: readonly RequestHandler[],
): Promise<void> => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return route.abort()
    }

    const request = new Request(url, { method: route.request().method() })
    for (const handler of handlers) {
      const result = await handler.run({
        request,
        requestId: randomUUID(),
        resolutionContext: { baseUrl: url.origin },
      })

      if (result?.response) {
        return route.fulfill({
          status: result.response.status,
          headers: Object.fromEntries(result.response.headers),
          body: Buffer.from(await result.response.arrayBuffer()),
        })
      }
    }

    const proxiedToAws =
      url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')
    return proxiedToAws ? route.abort() : route.continue()
  })
}
