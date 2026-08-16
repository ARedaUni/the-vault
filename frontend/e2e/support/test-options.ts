import { test as base, expect } from '@playwright/test'
import {
  catalogueClient,
  type CatalogueClient,
} from './catalogue.client.js'
import { VaultPage } from './vault.page.js'

type VaultFixtures = {
  vaultPage: VaultPage
  catalogue: CatalogueClient
}

/**
 * The single entry point for every spec. Specs must import `test` and `expect`
 * from here and never from '@playwright/test' directly — page objects are
 * injected, never constructed in a test body.
 */
export const test = base.extend<VaultFixtures>({
  vaultPage: async ({ page }, use) => {
    await use(new VaultPage(page))
  },
  catalogue: async ({ request }, use) => {
    await use(catalogueClient(request))
  },
})

export { expect }
