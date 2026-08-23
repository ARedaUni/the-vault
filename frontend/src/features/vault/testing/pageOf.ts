// The `.js` extension matters: this module is imported from the Playwright
// project too, which resolves with node's rules rather than Vite's.
import type { Shitpost, ShitpostPage } from '../api/shitposts.contract.js'

/**
 * How both fakes page: the MSW handlers used by the browser tier, and the
 * `page.route` fake used by Playwright. Shared so the two cannot drift, and
 * kept free of msw and Playwright imports so either process can load it.
 *
 * Pages at twenty because that is the deployed API's default and the gallery
 * sends no `limit` of its own. A fake that handed back everything at once
 * would let the gallery pass here and come up short against real AWS.
 */
const PAGE_SIZE = 20

/**
 * Pages by offset rather than by DynamoDB's LastEvaluatedKey. Both are legal:
 * the cursor is opaque, so every implementation is free to mean something
 * different by it. Encoding the offset keeps a caller from quietly depending
 * on what is inside one.
 */
export const pageOf = (all: readonly Shitpost[], url: URL): ShitpostPage => {
  const from = Number(atob(url.searchParams.get('cursor') ?? btoa('0')))
  const page = all.slice(from, from + PAGE_SIZE)
  const next = from + page.length

  return {
    shitposts: page,
    ...(next < all.length ? { nextCursor: btoa(String(next)) } : {}),
  }
}
