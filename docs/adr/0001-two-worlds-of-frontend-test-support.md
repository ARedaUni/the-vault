# 1. The frontend's test support has two worlds, and the directories say so

Date: 2026-08-23

## Status

Accepted.

## Context

`frontend/e2e/` holds two kinds of Playwright spec that answer different
questions and must never be confused:

- **app specs** (`e2e/app/`) ask *is this frontend correct?* They run against a
  captured fixture, in a real browser, with every non-localhost request aborted.
  Hermetic, fast, and safe to run in CI on every push.
- **contract specs** (`e2e/contract/`) ask *is the deployed API still shaped the
  way this frontend parses it?* They talk to real AWS. No fixture can answer
  that question, and nothing hermetic can either.

The spec directories were already split. Their support code was not: five flat
files sat in `e2e/support/`, two belonging to one world and three to the other,
with nothing but a filename prefix (`contract-options.ts` vs `test-options.ts`)
to say which was which.

The cost showed up as soon as the directory stopped fitting in one's head — "I
don't know what these do anymore". Worse, the flat layout made the most
important property of the setup invisible. An app spec importing the contract
entry point would silently gain the ability to call production, and nothing in
the file tree would look wrong.

## Decision

Mirror the spec split in the support tree, and name each world's entry point
identically so the directory carries the meaning instead of the filename:

```
e2e/
  app/       vault.spec.ts
  contract/  catalogue.spec.ts
  support/
    app/       options.ts, catalogue.fake.ts, vault.page.ts
    contract/  options.ts, catalogue.client.ts
```

Each world exposes exactly one entry point — `support/<world>/options.ts` — which
re-exports `test` and `expect` with that world's fixtures already wired. Specs
import from their own world's entry point and never from `@playwright/test`
directly.

## Consequences

The import line now names the world: `../support/app/options.js` versus
`../support/contract/options.js`. A spec in the wrong world is visible in a
diff rather than discoverable only by reading fixture definitions.

Hermeticity stays enforced by code, not convention. `support/app/catalogue.fake.ts`
registers an abort route for every non-localhost request and installs itself as
an `auto` fixture, so an app spec cannot reach AWS even if it forgets to ask for
the fake. The directory split makes that guarantee legible; it does not replace
it.

Adding a third world — visual regression, a second deployed environment — means
adding a directory, not renaming files to keep prefixes unambiguous.

The cost is one extra directory level and deeper relative imports from support
files back into `src/`. Both are one-time.

This is a structural change only. No spec's behaviour changed, and both suites
pass unmodified apart from their import paths.
