# Testing strategy

This frontend runs four test tiers. Each has a job, and — more importantly —
each has work it is **forbidden** to do, because the failure mode of a suite
without boundaries is that everything drifts upward into the slowest tier until
nobody wants to run it.

Every tier below the contract tier runs in **real Chromium**. There is no jsdom
in this repo and there will not be: a simulated DOM lets a component pass in a
fast tier and fail in a slow one, which is the single thing this structure
exists to prevent.

## The tiers

| Tier | Runner | Entry point | Tests exhaustively | Must NOT test |
| --- | --- | --- | --- | --- |
| **unit** | Vitest, node | A plain function | Pure logic and its boundaries | Anything needing a DOM |
| **storybook** | Vitest, Chromium | A component's props | One component's rendering decisions | Data fetching, app state |
| **browser** | Vitest, Chromium | A React tree, or an adapter | App behaviour per API response; adapter edge cases | The dev server, the proxy, real media |
| **app** | Playwright, Chromium | `goto('/')` on the dev server | 3–5 user journeys | Anything a lower tier can reach |
| **contract** | Playwright, real AWS | The deployed API | That the wire format still matches | Any UI behaviour |

## The rules

**1. A spec lives at the lowest tier that can prove it.**

If a claim can be proven by rendering `<App />` with a canned response, it does
not belong in Playwright. The test asks the same question either way; the only
difference is that one costs a dev server, a page load and a navigation.

**2. The app tier is representative, not exhaustive.**

Three to five user journeys. Its job is "the whole stack is wired together for
the happy path and the critical failure path" — not "every state the UI can
enter". A new UI state is a `browser` spec by default. It earns a Playwright
spec only if the wiring *between* pieces is what could break: the dev proxy, a
real media fetch over real HTTP, lazy loading, navigation, a11y of the composed
page.

**3. Fakes plug in at the network boundary, never into the module graph.**

The app under test always runs its real code. `fetchShitposts`, `useCatalogue`
and every component execute for real in every tier; only HTTP is answered by a
fake. We do not stub modules, and we do not assert that a function was called —
contract assertions are made against the network, or against what the user can
see, and nowhere else.

A test that would still pass if the behaviour it names were deleted is worse
than no test, because it reports safety that is not there.

**4. Unhandled requests are errors.**

Both `browser` and `app` fail on any request nobody explicitly handled. A fake
that quietly stopped covering some call must break the build, not silently let
a test reach real AWS. Hermeticity that depends on remembering to ask for it is
not hermeticity.

**5. Both hermetic tiers answer from the same captured fixture.**

`src/test/fixtures/catalogue.json` is a verbatim slice of a real response,
never hand-authored, and both tiers re-parse it through the *strict* contract
schema at load. So the two tiers cannot disagree about what the API returns,
even though they install their fakes differently: the `browser` tier uses MSW
handlers, the `app` tier uses Playwright's `page.route`.

Those two implementations are a wart. MSW handlers are plain functions and can
be driven from Playwright too; folding the `app` tier onto them would leave one
definition of the fake instead of two. Not done yet.

**6. Only the contract tier talks to AWS, and it is not in CI.**

The lower tiers prove this frontend is correct against a captured fixture. That
proof is worth exactly as much as the fixture's resemblance to production, and
nothing inside a hermetic suite can check that. `npm run test:contract` closes
the loop; run it after a deploy or a backend change.

## What we give up

**Duplication between `storybook` and `browser`.** A component's rendering can
be asserted in a story and again through `<App />`. We accept it where the two
are asking different questions — "does this tile render a video element" versus
"does the gallery show a tile per shitpost" — and delete it where they aren't.

**Coupling to the current architecture.** Tier boundaries assume there is an
adapter layer and a component layer. If the app collapsed into one file, the
lower tiers would need deleting rather than porting. That is a real cost of not
being outside-in-only, and it buys the fast feedback loop that makes TDD
tolerable on UI work.

**The app tier can miss things by construction.** Sampling means some
combination of states is never exercised end to end. That is the deal: we pay
for it with breadth at the `browser` tier, which is cheap enough to be
exhaustive.

## When we would change our minds

- **If the app tier starts catching bugs the browser tier missed.** That would
  mean the fake has drifted from what the dev server actually does, and the
  boundary is in the wrong place.
- **If the browser tier passes ~5s.** Sampling would start to look attractive
  there too.
- **If a second consumer of the adapters appears.** The adapter specs become
  more valuable, not less, and the component tiers narrow to rendering only.

## Adding a test

1. Name the behaviour as something a user or a caller could observe.
2. Find the lowest tier whose entry point can observe it. Write it there.
3. If you are writing a Playwright spec, justify it against rule 2. "It felt
   more realistic" is not a justification — every tier here is a real browser.

## Further reading

The four-tier split, the sparse-acceptance rule and the network-boundary rule
are adapted from Paul Hammond's
[TypeScript TDD workshop](https://github.com/citypaul/tdd-workshop-typescript),
whose `docs/testing-strategy.md` argues the trade-offs at greater length and is
worth reading in full.
