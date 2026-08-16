# The Vault — Signal's viewing room

Vite + React + TypeScript. `npm run dev` proxies straight to real AWS; there
are no local stubs and no mock server.

```bash
cp .env.example .env  # once, after cloning

npm run dev        # http://localhost:5173, hot reload, proxied to real AWS
npm run verify     # lint + typecheck + the whole Playwright suite
npm run test:smoke # the fast subset
npm run test:ui    # Playwright's watch-mode UI
```

## Layout

```
src/
├── api/
│   ├── catalogue.contract.ts   the wire format, and the only place it is stated
│   └── catalogue.ts            fetch + media URL construction
├── components/Tile.tsx
├── domain/media-kind.ts        image vs video, by extension
├── hooks/use-catalogue.ts      loading | ready | failed state machine
├── config.ts                   zod-parsed environment
└── App.tsx

e2e/
├── support/
│   ├── test-options.ts         fixtures — the only import specs use
│   ├── vault.page.ts           locators and actions
│   └── catalogue.client.ts     typed API calls
└── vault.spec.ts               everything about the gallery
```

One spec file per user-facing feature, with `describe` blocks inside for the
different concerns. When the delete control, feed tab and search bar land they
become `delete.spec.ts`, `feed.spec.ts` and `search.spec.ts` — never a file per
kind of test, because "what does the gallery do?" should be answerable by
opening one file.

## Conventions

**Import `test` and `expect` from `e2e/support/test-options.ts`, never from
`@playwright/test`.** Page objects arrive injected. Constructing one in a test
body (`new VaultPage(page)`) means the fixture layer has been bypassed.

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

**No mocks.** Tests talk to the deployed API and to CloudFront. The single
exception is the `failure states` block, which injects network faults with
`page.route` because a 503, an empty catalogue and a malformed payload are
unreachable against a healthy production API. Everything else observes.

## The API contract

`src/api/catalogue.contract.ts` states the catalogue's wire format once, and
derives two schemas from it:

- **`shitpostsResponseSchema`** — tolerant, used by the app. Unknown keys are
  stripped, so the backend adding a field cannot break the browser.
- **`exactShitpostsResponseSchema`** — strict, used only by the contract test.
  An added, renamed or retyped field fails a test instead of degrading quietly.

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
