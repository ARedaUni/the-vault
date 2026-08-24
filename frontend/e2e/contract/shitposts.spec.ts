import { exactShitpostsResponseSchema } from '../../src/features/vault/api/shitposts.contract.js'
import { capturedShitposts } from '../../src/features/vault/testing/shitposts.fixture.js'
import { expect, test } from '../support/contract/options.js'

/**
 * The drift canary. Talks to real AWS, and is therefore NOT part of CI.
 *
 * The app suite proves this frontend is correct against a captured fixture.
 * That proof is only worth as much as the fixture's resemblance to production,
 * and nothing inside a hermetic suite can check that. These specs close the
 * loop: run them after a deploy, or whenever the backend changes.
 *
 *   npm run test:contract
 */

const capturedKeys = Object.keys(capturedShitposts[0] ?? {}).sort()

test.describe('contract', () => {
  test(
    'returns a page matching the shape the frontend parses',
    { tag: '@api' },
    async ({ shitposts }) => {
      const { status, body } = await shitposts.listShitposts()

      expect(status).toBe(200)
      // Strict parse: an added, renamed or retyped field on the deployed API
      // fails here rather than degrading silently in the browser.
      expect(() => exactShitpostsResponseSchema.parse(body)).not.toThrow()
    },
  )

  test('orders shitposts newest first', { tag: '@api' }, async ({
    shitposts,
  }) => {
    const { body } = await shitposts.listShitposts()
    const page = exactShitpostsResponseSchema.parse(body)

    const uploadTimes = page.shitposts.map((shitpost) => shitpost.uploadedAt)
    expect(uploadTimes).toEqual([...uploadTimes].sort().reverse())
  })

  test('hands back a cursor that fetches the next page', { tag: '@api' }, async ({
    shitposts,
  }) => {
    const first = exactShitpostsResponseSchema.parse(
      (await shitposts.listShitposts({ limit: 5 })).body,
    )

    expect(first.shitposts).toHaveLength(5)
    expect(
      first.nextCursor,
      'the deployed archive is too small to page — capture a bigger fixture',
    ).toBeDefined()

    const second = exactShitpostsResponseSchema.parse(
      (await shitposts.listShitposts({ limit: 5, cursor: first.nextCursor })).body,
    )

    // Overlap between pages would show the reader duplicate memes as it scrolls.
    const keys = [...first.shitposts, ...second.shitposts].map((s) => s.shitpostKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('walks the whole archive and stops', { tag: '@api' }, async ({ shitposts }) => {
    // The API clamps limit at 100, so no single request can reach the last page
    // however large a number is asked for — the walk is the only way to prove
    // paging terminates rather than looping forever.
    const seen: string[] = []
    let cursor: string | undefined
    let requests = 0

    do {
      const page = exactShitpostsResponseSchema.parse(
        (await shitposts.listShitposts({ limit: 50, cursor })).body,
      )
      seen.push(...page.shitposts.map((shitpost) => shitpost.shitpostKey))
      cursor = page.nextCursor
      requests += 1
      expect(requests, 'paging never exhausted the archive').toBeLessThan(50)
    } while (cursor !== undefined)

    expect(seen.length).toBeGreaterThan(100)
    expect(new Set(seen).size, 'a shitpost appeared on two pages').toBe(seen.length)
  })

  test(
    'still sends the fields the captured fixture was built from',
    { tag: '@api' },
    async ({ shitposts }) => {
      // The app suite trusts the fixture. This is the assertion that earns
      // that trust: if production has moved on, the fixture is stale and
      // `npm run fixture:capture` is overdue.
      const { body } = await shitposts.listShitposts()
      const page = exactShitpostsResponseSchema.parse(body)
      const live = page.shitposts[0]

      expect(live, 'the deployed archive is empty').toBeDefined()
      expect(Object.keys(live ?? {}).sort()).toEqual(capturedKeys)
    },
  )

  test(
    'refuses to delete a shitpost it does not hold',
    { tag: '@api' },
    async ({ shitposts }) => {
      // The only deletion this spec can afford to make: one that changes
      // nothing. It still proves the route exists, takes an encoded key as one
      // segment, and answers 404 rather than 204 for a key it never held —
      // which is what the app's fake promises in `shitposts.deletes`.
      //
      // The body matters: API Gateway 404s any route it has never heard of,
      // so the status alone would pass against a backend with no DELETE at
      // all. Only the catalogue says "unknown shitpost".
      const { status, body } = await shitposts.deleteShitpost(
        'media/contract/never-uploaded.png',
      )

      expect(status).toBe(404)
      expect(JSON.parse(String(body))).toEqual({ error: 'unknown shitpost' })
    },
  )
})
