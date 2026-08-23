import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import {
  type Shitpost,
  exactShitpostsResponseSchema,
} from '../../../src/api/shitposts.contract.js'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * The captured shitposts, re-parsed through the *strict* contract schema on
 * every run. A fixture that has drifted from the schema the app parses fails
 * here, at load, rather than silently propping up tests that prove nothing.
 *
 * Refresh it with `npm run fixture:capture`; verify it still matches the
 * deployed API with `npm run test:contract`.
 */
export const capturedShitposts: readonly Shitpost[] =
  exactShitpostsResponseSchema.parse(
    JSON.parse(readFileSync(path.join(here, '../../../src/test/fixtures/shitposts.json'), 'utf8')),
  ).shitposts

/** A real, decodable 1x1 PNG — enough for naturalWidth to be non-zero. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const asJson = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

export type ShitpostsFake = {
  /** Answer with these shitposts. Defaults to the captured shitposts. */
  serve(shitposts?: readonly Shitpost[]): Promise<void>
}

/**
 * The shitposts port, faked at the HTTP boundary.
 *
 * For an app under test in a real browser, HTTP *is* the port — there is no
 * module graph to inject into, so `page.route` is where a hand-written fake
 * plugs in. Same principle as a Context-injected fake, different seam.
 *
 * Media is served too: any key the API advertises returns a real PNG, and any
 * key it does not returns 404. That makes a broken `mediaUrlFor` fail as a
 * missing image rather than passing because a blanket stub answered anything.
 */
export const shitpostsFake = async (page: Page): Promise<ShitpostsFake> => {
  const keys = new Set(capturedShitposts.map((shitpost) => shitpost.shitpostKey))

  // Registered first, so it matches last: Playwright checks routes newest-first.
  // Anything leaving the dev server is aborted, which turns a stub that quietly
  // stopped covering some request into a failing test instead of a silent call
  // to real AWS. This is what makes the suite provably offline.
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => route.abort(),
  )

  await page.route('**/media/**', (route) => {
    const requested = decodeURIComponent(
      new URL(route.request().url()).pathname.replace(/^\//, ''),
    )

    return keys.has(requested)
      ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
      : route.fulfill({ status: 404, contentType: 'text/plain', body: 'no such media' })
  })

  const answer = async (handler: Parameters<Page['route']>[1]) => {
    await page.unroute('**/api/shitposts')
    await page.route('**/api/shitposts', handler)
  }

  const fake: ShitpostsFake = {
    serve: (shitposts = capturedShitposts) =>
      answer((route) => route.fulfill(asJson({ shitposts }))),
  }

  await fake.serve()
  return fake
}
