import { AxeBuilder } from '@axe-core/playwright'
import { capturedShitposts } from '../../src/features/vault/testing/shitposts.fixture.js'
import { expect, test } from '../support/app/options.js'

/**
 * The Vault, served by the same MSW handlers the browser tier uses. No network
 * leaves the dev server.
 *
 * This tier is representative, not exhaustive — see docs/testing-strategy.md.
 * Per-response behaviour (loading, failure, retry, empty, contract violation,
 * tag rendering) lives in src/features/vault/layout/App.test.tsx, which asks
 * the same questions in the same browser without paying for a dev server and a
 * navigation. What is left here is the wiring only Playwright can exercise:
 * a real page load, real media fetched over real HTTP, lazy loading, and the
 * accessibility of the fully composed page.
 *
 * Every expectation is derived from the captured fixture rather than fetched
 * at runtime, so a failure means the app is wrong — never that AWS was slow,
 * redeployed, or holding different data.
 */

test.describe('opening the vault', () => {
  test(
    'loads the gallery and serves media the API can actually resolve',
    { tag: '@smoke' },
    async ({ page, vaultPage }) => {
      // The fake 404s any key the API does not advertise, so a broken
      // mediaUrlFor shows up here as a missing image rather than passing
      // because a blanket stub answered everything.
      const served: number[] = []
      page.on('response', (response) => {
        if (response.url().includes('/media/')) {
          served.push(response.status())
        }
      })

      await vaultPage.open()

      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await expect(vaultPage.heading).toBeVisible()
      await expect(vaultPage.shitpostCount).toHaveText(
        `${capturedShitposts.length} shitposts`,
      )
      await expect(vaultPage.tiles).toHaveCount(capturedShitposts.length)

      // Tiles render before their lazy media resolves, so poll rather than
      // read once — otherwise this passes or fails on viewport size alone.
      await expect(vaultPage.images.first()).toBeVisible()
      await expect.poll(() => served.length).toBeGreaterThan(0)
      expect(served.filter((status) => status >= 400)).toEqual([])
    },
  )

  test(
    'decodes the images rather than rendering broken links',
    { tag: '@smoke' },
    async ({ vaultPage }) => {
      await vaultPage.open()
      const firstImage = vaultPage.images.first()
      await expect(firstImage).toBeVisible()

      await expect(firstImage).toHaveJSProperty('complete', true)
      const naturalWidth = await firstImage.evaluate(
        (image: HTMLImageElement) => image.naturalWidth,
      )
      expect(naturalWidth).toBeGreaterThan(0)
    },
  )
})

test.describe('accessibility', () => {
  test(
    'meets WCAG 2.1 AA on the gallery',
    { tag: '@regression' },
    async ({ page, vaultPage }) => {
      await vaultPage.open()
      await expect(vaultPage.tiles.first()).toBeVisible()

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // Harvested meme clips ship without caption tracks and we cannot
        // author them; every other video rule stays on.
        .disableRules(['video-caption'])
        .analyze()

      expect(violations.map((violation) => violation.id)).toEqual([])
    },
  )
})
