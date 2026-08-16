import { AxeBuilder } from '@axe-core/playwright'
import { capturedCatalogue } from '../support/catalogue.fake.js'
import { expect, test } from '../support/test-options.js'

/**
 * The Vault, served by the catalogue fake. No network leaves the dev server.
 *
 * Every expectation here is derived from the captured fixture rather than
 * fetched at runtime, so a failure means the app is wrong — never that AWS was
 * slow, redeployed, or holding different data.
 */

test.describe('catalogue', () => {
  test(
    'renders one tile per shitpost in the catalogue',
    { tag: '@smoke' },
    async ({ vaultPage }) => {
      await vaultPage.open()

      await expect(vaultPage.catalogueSize).toHaveText(
        `${capturedCatalogue.length} shitposts`,
      )
      await expect(vaultPage.tiles).toHaveCount(capturedCatalogue.length)
    },
  )

  test(
    'renders every tile as either an image or a video',
    { tag: '@smoke' },
    async ({ vaultPage }) => {
      await vaultPage.open()
      await expect(vaultPage.tiles).toHaveCount(capturedCatalogue.length)

      const [images, videos] = await Promise.all([
        vaultPage.images.count(),
        vaultPage.videos.count(),
      ])

      expect(images + videos).toBe(capturedCatalogue.length)
    },
  )

  test(
    'shows the tags the catalogue holds for a shitpost',
    { tag: '@regression' },
    async ({ vaultPage }) => {
      // The fixture is captured, so this index is a fact about real data rather
      // than a runtime search that could skip itself into vacuous success.
      const position = capturedCatalogue.findIndex(
        (shitpost) => shitpost.tags.length > 0,
      )

      await vaultPage.open()

      await expect(vaultPage.tagsOf(position)).toHaveText([
        ...(capturedCatalogue[position]?.tags ?? []),
      ])
    },
  )
})

test.describe('media', () => {
  test(
    'requests media the catalogue can actually serve',
    { tag: '@smoke' },
    async ({ page, vaultPage }) => {
      // The fake 404s any key the catalogue does not hold, so a broken
      // mediaUrlFor shows up here as a missing image rather than passing
      // because a blanket stub answered everything.
      const served: number[] = []
      page.on('response', (response) => {
        if (response.url().includes('/media/')) {
          served.push(response.status())
        }
      })

      await vaultPage.open()
      await expect(vaultPage.images.first()).toBeVisible()

      // Tiles render before their lazy media resolves, so poll rather than
      // read once — otherwise this passes or fails on viewport size alone.
      await expect.poll(() => served.length).toBeGreaterThan(0)
      expect(served.filter((status) => status >= 400)).toEqual([])
    },
  )

  test(
    'decodes the images rather than rendering broken links',
    { tag: '@regression' },
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

test.describe('failure states', () => {
  test(
    'announces that it is loading while the catalogue is in flight',
    { tag: '@regression' },
    async ({ vaultPage, catalogue }) => {
      await catalogue.stall(2_000)

      await vaultPage.open()

      await expect(vaultPage.loadingMessage).toBeVisible()
      await expect(vaultPage.gallery).toBeVisible()
      await expect(vaultPage.loadingMessage).toBeHidden()
    },
  )

  test(
    'reports a failure and recovers when the catalogue is retried',
    { tag: '@regression' },
    async ({ vaultPage, catalogue }) => {
      // Fail every request while the outage lasts, then lift it. Failing only
      // the first is not deterministic: StrictMode double-invokes the effect
      // in dev, so the 503 would land on the request React then aborts.
      await catalogue.fail(503)

      await vaultPage.open()
      await expect(vaultPage.errorMessage).toBeVisible()

      await catalogue.serve()
      await vaultPage.retryButton.click()

      await expect(vaultPage.gallery).toBeVisible()
      await expect(vaultPage.errorMessage).toBeHidden()
    },
  )

  test(
    'says the vault is empty when the catalogue holds nothing',
    { tag: '@regression' },
    async ({ vaultPage, catalogue }) => {
      await catalogue.serve([])

      await vaultPage.open()

      await expect(vaultPage.emptyMessage).toBeVisible()
      await expect(vaultPage.catalogueSize).toHaveText('0 shitposts')
      await expect(vaultPage.gallery).toBeHidden()
    },
  )

  test(
    'reports a failure when the catalogue breaks its contract',
    { tag: '@regression' },
    async ({ vaultPage, catalogue }) => {
      await catalogue.breakContract()

      await vaultPage.open()

      await expect(vaultPage.errorMessage).toBeVisible()
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

  test(
    'exposes the gallery through landmarks and a labelled list',
    { tag: '@regression' },
    async ({ page, vaultPage }) => {
      await vaultPage.open()

      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await expect(vaultPage.heading).toBeVisible()
      await expect(vaultPage.gallery).toBeVisible()
    },
  )
})
