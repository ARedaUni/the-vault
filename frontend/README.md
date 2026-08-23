# The Vault — Signal's viewing room

Vite + React + TypeScript. `npm run dev` proxies straight to real AWS. The
tests do not: the app suite is hermetic, and only the contract suite leaves the
machine.

```bash
cp .env.example .env  # once, after cloning

npm run dev           # http://localhost:5173, hot reload, proxied to real AWS
npm run verify        # lint + typecheck + unit + stories + hermetic e2e
npm run test:smoke    # the fast subset
npm run test:ui       # Playwright's watch-mode UI

npm run test:contract # the ONLY suite that talks to AWS. Not in CI.
npm run fixture:capture  # refresh the captured shitposts from the live API
```

## Layout

```
src/
├── api/
│   ├── shitposts.contract.ts   the wire format, and the only place it is stated
│   └── shitposts.ts            fetch + media URL construction
├── domain/mediaKind.ts          image vs video, by extension
├── features/vault/             UI, sliced by feature
│   ├── components/Tile.tsx
│   └── layout/App.tsx
├── hooks/useShitposts.ts        loading | ready | failed state machine
├── test/fixtures/shitposts.json  captured from production, never hand-written
├── config.ts                   zod-parsed environment
└── main.tsx

e2e/
├── app/vault.spec.ts           the gallery. Hermetic.
├── contract/shitposts.spec.ts  the deployed API. Live.
└── support/                    mirrors the split above — one folder per world
    ├── app/
    │   ├── options.ts          app fixtures — installs the fake automatically
    │   ├── shitposts.fake.ts   the shitposts port, faked at the HTTP boundary
    │   └── vault.page.ts       locators and actions
    └── contract/
        ├── options.ts          contract fixtures — no stubs, real HTTP
        └── shitposts.client.ts typed API calls, contract suite only
```

UI lives under `features/<domain>/` with `components/` for single-purpose
elements, `patterns/` for compositions spanning several, and `layout/` for page
containers. Imports crossing out of a feature use the `@/` alias; inside one
they stay relative, so the folder tells you where the seam is.

One spec file per user-facing feature, with `describe` blocks inside for the
different concerns. When the delete control, feed tab and search bar land they
become `delete.spec.ts`, `feed.spec.ts` and `search.spec.ts` — never a file per
kind of test, because "what does the gallery do?" should be answerable by
opening one file.

## Conventions

**Import `test` and `expect` from your world's `e2e/support/<world>/options.ts`,
never from `@playwright/test`.** The import line is what says which world a spec
belongs to — `support/app/options.js` cannot reach AWS, `support/contract/options.js`
talks to nothing else. See [ADR 1](../docs/adr/0001-two-worlds-of-frontend-test-support.md).
Page objects arrive injected. Constructing one in a test body
(`new VaultPage(page)`) means the fixture layer has been bypassed.

**Filenames match their primary export.** `Tile.tsx` exports `Tile`,
`useShitposts.ts` exports `useShitposts`. One rule, no kebab-case exception for
non-components — the import line then tells you exactly what you are getting.

**Locators are semantic and live on the page object as getters.** `getByRole`,
`getByLabel`, `getByText` — never XPath, and CSS only where no role exists
(the `[data-media-kind]` attributes). A getter resolves at use time; a field
assigned in the constructor captures a stale handle. The payoff is that a test
fails when the accessibility tree breaks, not merely when a class is renamed.

**Web-first assertions only.** `expect(locator).toBeVisible()` and
`expect.poll()` retry; `page.waitForTimeout()` is a hard wait and is banned.
Reading a mutable array once, rather than polling it, is the same bug wearing a
different hat — it is what made the media test pass on desktop and fail on
mobile.

**Exactly one tag per test**, on the test and never on the `describe`:
`@smoke` (the critical path), `@api` (contract), `@regression` (everything
else).

## Why the app suite is hermetic

A test that talks to real AWS answers two questions at once — "is my code
correct?" and "is production healthy?" — and gives you one bit to tell them
apart. When it goes red you cannot know which broke, so eventually you stop
looking. The suites are split so each answers exactly one question.

**`e2e/app/` — is this frontend correct?** Every request is answered by
`shitposts.fake.ts`. It is a hand-written fake, not a mock: it implements the
API's HTTP contract, and for an app under test in a real browser HTTP
*is* the port — there is no module graph to inject into, so `page.route` is
where the fake plugs in. A catch-all route aborts anything addressed outside
the dev server, which is what makes "hermetic" a property rather than a hope.
Media is served too, and any key the API does not advertise gets a 404, so a
broken `mediaUrlFor` surfaces as a missing image instead of passing because a
blanket stub answered everything.

**`e2e/contract/` — has the deployed API moved?** The one question a fake can
never answer, so these specs talk to real AWS on purpose and stay out of CI. A
build must not go red because CloudFront hiccupped.

**The fixture is captured, never invented.** `npm run fixture:capture` writes a
verbatim contiguous slice of a real response; the app suite re-parses it
through the *strict* schema on every run, so a fixture that has drifted fails
at load rather than propping up tests that prove nothing. An invented fixture
passes its own tests forever while diverging from what AWS actually sends —
the same failure that once cost us every wide event in production.

The honest limit: hermetic tests can only be as truthful as the fixture. That
is what `test:contract` is for, and why it must be run after a deploy rather
than admired.

## The API contract

`src/api/shitposts.contract.ts` states the wire format once, and
derives two schemas from it:

- **`shitpostsResponseSchema`** — tolerant, used by the app. Unknown keys are
  stripped, so the backend adding a field cannot break the browser.
- **`exactShitpostsResponseSchema`** — strict, used by the contract suite and by
  the fixture loader. An added, renamed or retyped field fails a test instead of
  degrading quietly.

It deliberately does **not** import from `lambda/shared/domain`. That is the
backend's internal model — the inside of its hexagon — and the frontend depends
on the deployed HTTP response instead. The two halves deploy independently, so
a compile-time type import would assert a version agreement that does not hold;
the contract test checks what is actually running.

## Environment

`.env` is gitignored; `.env.example` is the committed template and holds two
kinds of variable:

- `AWS_*` — origins the dev server proxies to. Server-side only, never bundled.
- `VITE_*` — same-origin paths the browser calls.

The browser always calls `/api` and `/media`. In development the Vite proxy
serves them; in production they are intended to become CloudFront behaviours
pointing at API Gateway and the media bucket, so no application code changes
between the two. To point at a different stack, override in `.env.local`, which
Vite loads after `.env` and which is also gitignored.
