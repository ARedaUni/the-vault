import {
  type Shitpost,
  exactShitpostsResponseSchema,
} from '../shitposts.contract.js'
import captured from './shitposts.captured.js'

/**
 * The captured shitposts, shared by every hermetic tier.
 *
 * Re-parsed through the *strict* contract schema at import time, so a fixture
 * that has drifted from the schema the app parses fails here, at load, rather
 * than silently propping up tests that prove nothing.
 *
 * Refresh it with `npm run fixture:capture`; verify it still matches the
 * deployed API with `npm run test:contract`.
 */
export const capturedShitposts: readonly Shitpost[] =
  exactShitpostsResponseSchema.parse(captured).shitposts

/**
 * A hoard larger than one page. The captured fixture holds twelve, and the API
 * serves twenty at a time, so nothing captured can demonstrate paging on its
 * own. Every field but the key and the timestamp is copied from a real row —
 * and those two are the only ones paging actually orders by.
 */
export const manyShitposts = (count: number): readonly Shitpost[] =>
  Array.from({ length: count }, (_, index) => {
    const real = capturedShitposts[index % capturedShitposts.length]
    if (real === undefined) {
      throw new Error('the captured fixture is empty — cannot build a page')
    }

    return {
      ...real,
      shitpostKey: `media/page-filler-${index}.png`,
      uploadedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
    }
  })

/** The first shitpost carrying at least one tag, for tag-rendering specs. */
export const firstTaggedIndex = capturedShitposts.findIndex(
  (shitpost) => shitpost.tags.length > 0,
)
