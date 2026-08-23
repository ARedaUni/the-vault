# Testing strategy

Three test tiers, plus a live contract check. Every tier that renders anything
does so in **real Chromium** — there is no jsdom in this repo and there will
not be: a simulated DOM lets a component pass in a fast tier and fail in a slow
one, which is the single thing this structure exists to prevent.

| Tier | Runner | Entry point | Owns | Must NOT test |
| --- | --- | --- | --- | --- |
| **unit** | Vitest, node | A plain function | Pure logic and its boundaries | Anything needing a DOM |
| **browser** | Vitest, Chromium | A React tree | Component rendering; app behaviour per API response | The dev server, the proxy, real media |
| **app** | Playwright, Chromium | `goto('/')` on the dev server | 3–5 user journeys | Anything a lower tier can reach |
| **contract** | Playwright, real AWS | The deployed API | That the wire format still matches | Any UI behaviour |

## The rules

**A spec lives at the lowest tier that can prove it.** Browser tier by
default; Playwright only for the wiring a lower tier cannot see (a real page
load, real media over real HTTP, lazy loading, a11y of the composed page);
contract only for the wire format. "It felt more realistic" is not a
justification for promoting a spec — every tier here is a real browser.

**One fake, plugged in at the network boundary.** The MSW handlers in
`src/features/vault/testing/shitposts.handlers.ts` are the only definition of
the fake API. The browser tier installs them in a service worker; the app tier
drives the same handlers through `page.route` (`e2e/support/app/network.ts`).
The app under test always runs its real code — we never stub modules, and we
never assert that a function was called. A test that would still pass if the
behaviour it names were deleted is worse than no test.

**Unhandled requests are errors.** Both hermetic tiers fail on any request
nobody explicitly handled, so a fake that quietly stopped covering some call
breaks the build instead of silently reaching real AWS.

**The fixture is captured, never invented.** The handlers answer from
`shitposts.captured.ts`, a verbatim slice of a real response, re-parsed through
the strict contract schema at load. Refresh it with `npm run fixture:capture`.

**Only the contract tier talks to AWS, and it is not in CI.** The hermetic
proof is worth exactly as much as the fixture's resemblance to production, and
nothing inside a hermetic suite can check that. `npm run test:contract` closes
the loop; run it after a deploy or a backend change.

## Further reading

The tier split, the sparse-acceptance rule and the network-boundary rule are
adapted from Paul Hammond's
[TypeScript TDD workshop](https://github.com/citypaul/tdd-workshop-typescript),
whose `docs/testing-strategy.md` argues the trade-offs at greater length. This
repo runs a smaller version of it: the Storybook tier is folded into the
browser tier, and the two per-runner fakes it tolerates are unified into one.
