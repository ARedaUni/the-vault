import { test as base, expect } from '@playwright/test'
import { type CatalogueClient, catalogueClient } from './catalogue.client.js'

type ContractFixtures = {
  catalogue: CatalogueClient
}

/**
 * The entry point for contract specs only.
 *
 * Deliberately has no page fixtures and installs no stubs: these specs exist to
 * ask the one question a fake can never answer — is the *deployed* API still
 * shaped the way this frontend parses it? Everything here talks to real AWS.
 */
export const test = base.extend<ContractFixtures>({
  catalogue: async ({ request }, use) => {
    await use(catalogueClient(request))
  },
})

export { expect }
