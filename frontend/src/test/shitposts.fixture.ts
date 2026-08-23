import {
  type Shitpost,
  exactShitpostsResponseSchema,
} from '@/api/shitposts.contract'
import captured from './fixtures/shitposts.json'

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

/** The first shitpost carrying at least one tag, for tag-rendering specs. */
export const firstTaggedIndex = capturedShitposts.findIndex(
  (shitpost) => shitpost.tags.length > 0,
)
