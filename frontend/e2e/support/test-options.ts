import { test as base, expect } from '@playwright/test'
import { type CatalogueFake, catalogueFake } from './catalogue.fake.js'
import { VaultPage } from './vault.page.js'

type VaultFixtures = {
  vaultPage: VaultPage
  catalogue: CatalogueFake
}

/**
 * The single entry point for every app spec. Specs must import `test` and
 * `expect` from here and never from '@playwright/test' directly — page objects
 * are injected, never constructed in a test body.
 *
 * The catalogue fake is `auto`, so it installs for every test whether or not
 * the test names it. Hermeticity that depends on remembering to ask for it is
 * not hermeticity.
 */
export const test = base.extend<VaultFixtures>({
  catalogue: [
    async ({ page }, use) => {
      await use(await catalogueFake(page))
    },
    { auto: true },
  ],

  vaultPage: async ({ page }, use) => {
    await use(new VaultPage(page))
  },
})

export { expect }
