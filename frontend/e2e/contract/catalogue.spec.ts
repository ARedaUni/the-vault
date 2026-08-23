import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exactShitpostsResponseSchema } from '../../src/api/catalogue.contract.js'
import { expect, test } from '../support/contract/options.js'

const here = path.dirname(fileURLToPath(import.meta.url))

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

const capturedKeys = Object.keys(
  exactShitpostsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(here, '../../src/test/fixtures/catalogue.json'), 'utf8'),
    ),
  ).shitposts[0] ?? {},
).sort()

test.describe('contract', () => {
  test(
    'returns a catalogue matching the shape the frontend parses',
    { tag: '@api' },
    async ({ catalogue }) => {
      const { status, body } = await catalogue.listShitposts()

      expect(status).toBe(200)
      // Strict parse: an added, renamed or retyped field on the deployed API
      // fails here rather than degrading silently in the browser.
      expect(() => exactShitpostsResponseSchema.parse(body)).not.toThrow()
    },
  )

  test('orders the catalogue newest first', { tag: '@api' }, async ({
    catalogue,
  }) => {
    const { body } = await catalogue.listShitposts()
    const { shitposts } = exactShitpostsResponseSchema.parse(body)

    const uploadTimes = shitposts.map((shitpost) => shitpost.uploadedAt)
    expect(uploadTimes).toEqual([...uploadTimes].sort().reverse())
  })

  test(
    'still sends the fields the captured fixture was built from',
    { tag: '@api' },
    async ({ catalogue }) => {
      // The app suite trusts the fixture. This is the assertion that earns
      // that trust: if production has moved on, the fixture is stale and
      // `npm run fixture:capture` is overdue.
      const { body } = await catalogue.listShitposts()
      const { shitposts } = exactShitpostsResponseSchema.parse(body)
      const live = shitposts[0]

      expect(live, 'the deployed catalogue is empty').toBeDefined()
      expect(Object.keys(live ?? {}).sort()).toEqual(capturedKeys)
    },
  )
})
