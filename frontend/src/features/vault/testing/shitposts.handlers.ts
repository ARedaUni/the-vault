import { HttpResponse, delay, http } from 'msw'
import type { RequestHandler } from 'msw'
import type { Shitpost } from '../api/shitposts.contract.js'
import { pageOf } from './pageOf.js'
import { capturedShitposts } from './shitposts.fixture.js'

/**
 * The shitposts port, faked at the network boundary.
 *
 * Plain handler factories rather than a stateful object, so a spec declares
 * the world it wants up front — `mswBrowserWorker.use(shitposts.fails(503))` —
 * and MSW resets between tests. The app under test always runs its real code:
 * `fetchShitposts`, `useShitposts` and every component execute for real, and
 * only HTTP is answered from here.
 */

const SHITPOSTS = '/api/shitposts'

/** A real, decodable 1x1 PNG — enough for naturalWidth to be non-zero. */
const PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const pixel = (): Uint8Array =>
  Uint8Array.from(atob(PIXEL_BASE64), (character) => character.charCodeAt(0))

export const shitposts = {
  /** Answer with these shitposts, one page at a time. Defaults to the captured ones. */
  serves: (all: readonly Shitpost[] = capturedShitposts): RequestHandler =>
    http.get(SHITPOSTS, ({ request }) =>
      HttpResponse.json(pageOf(all, new URL(request.url))),
    ),

  /** Answer with an HTTP error. */
  fails: (status: number): RequestHandler =>
    http.get(SHITPOSTS, () =>
      // Verbatim from the deployed API, which still calls itself the
      // catalogue. A fake that invents a nicer error body proves nothing.
      HttpResponse.json({ error: 'catalogue unavailable' }, { status }),
    ),

  /** Answer with a body that violates the contract the app parses. */
  breaksContract: (): RequestHandler =>
    http.get(SHITPOSTS, () =>
      HttpResponse.json({ shitposts: [{ shitpostKey: 42 }] }),
    ),

  /** Hold every shitposts request open for `ms` before answering. */
  stalls: (ms: number): RequestHandler =>
    http.get(SHITPOSTS, async () => {
      await delay(ms)
      return HttpResponse.json({ shitposts: capturedShitposts })
    }),
}

/**
 * Media, served for any key the API advertises and 404'd for any it does not.
 * That makes a broken `mediaUrlFor` fail as a missing image rather than pass
 * because a blanket stub answered anything.
 */
export const media = (
  shitposts: readonly Shitpost[] = capturedShitposts,
): RequestHandler => {
  const keys = new Set(shitposts.map((shitpost) => shitpost.shitpostKey))

  return http.get('/media/*', ({ request }) => {
    const requested = decodeURIComponent(
      new URL(request.url).pathname.replace(/^\//, ''),
    )

    return keys.has(requested)
      ? HttpResponse.arrayBuffer(pixel().buffer as ArrayBuffer, {
          headers: { 'Content-Type': 'image/png' },
        })
      : new HttpResponse('no such media', { status: 404 })
  })
}

/** An API that answers normally and serves the media it advertises. */
export const healthyShitposts = (): readonly RequestHandler[] => [
  shitposts.serves(),
  media(),
]
