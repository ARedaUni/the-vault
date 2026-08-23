import { test as base, expect } from '@playwright/test'
import { type ShitpostsClient, shitpostsClient } from './shitposts.client.js'

type ContractFixtures = {
  shitposts: ShitpostsClient
}

/**
 * The entry point for contract specs only.
 *
 * Deliberately has no page fixtures and installs no stubs: these specs exist to
 * ask the one question a fake can never answer — is the *deployed* API still
 * shaped the way this frontend parses it? Everything here talks to real AWS.
 */
export const test = base.extend<ContractFixtures>({
  shitposts: async ({ request }, use) => {
    await use(shitpostsClient(request))
  },
})

export { expect }
