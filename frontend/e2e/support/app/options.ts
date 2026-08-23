import { test as base, expect } from '@playwright/test'
import { healthyShitposts } from '../../../src/features/vault/testing/shitposts.handlers.js'
import { routeThroughHandlers } from './network.js'
import { VaultPage } from './vault.page.js'

type VaultFixtures = {
  vaultPage: VaultPage
  network: void
}

/**
 * The single entry point for every app spec. Specs must import `test` and
 * `expect` from here and never from '@playwright/test' directly — page objects
 * are injected, never constructed in a test body.
 *
 * The network fixture is `auto`, so the MSW handlers answer every test whether
 * or not the test names it. Hermeticity that depends on remembering to ask for
 * it is not hermeticity.
 */
export const test = base.extend<VaultFixtures>({
  network: [
    async ({ page }, use) => {
      await routeThroughHandlers(page, healthyShitposts())
      await use()
    },
    { auto: true },
  ],

  vaultPage: async ({ page }, use) => {
    await use(new VaultPage(page))
  },
})

export { expect }
