import { AxeBuilder } from '@axe-core/playwright'
import {
  exactShitpostsResponseSchema,
  shitpostsResponseSchema,
} from '../src/api/catalogue.contract.js'
import { expect, test } from './support/test-options.js'

test.describe('catalogue', () => {
  test(
    'renders one tile per shitpost in the catalogue',
    { tag: '@smoke' },
    async ({ vaultPage, catalogue }) => {
      const { body } = await catalogue.listShitposts()
      const { shitposts } = shitpostsResponseSchema.parse(body)
      expect(shitposts.length).toBeGreaterThan(0)

      await vaultPage.open()

      await expect(vaultPage.catalogueSize).toHaveText(
        `${shitposts.length} shitposts`,
      )
      await expect(vaultPage.tiles).toHaveCount(shitposts.length)
    },
  )

  test(
    'renders every tile as either an image or a video',
    { tag: '@smoke' },
    async ({ vaultPage }) => {
      await vaultPage.open()
      await expect(vaultPage.tiles.first()).toBeVisible()

      const [tiles, images, videos] = await Promise.all([
        vaultPage.tiles.count(),
        vaultPage.images.count(),
        vaultPage.videos.count(),
      ])

      expect(images + videos).toBe(tiles)
    },
  )

  test(
    'shows the tags the catalogue holds for a shitpost',
    { tag: '@regression' },
    async ({ vaultPage, catalogue }) => {
      const { body } = await catalogue.listShitposts()
      const { shitposts } = shitpostsResponseSchema.parse(body)
      const position = shitposts.findIndex(
        (shitpost) => shitpost.tags.length > 0,
      )
      test.skip(position === -1, 'no shitpost in the catalogue carries tags')

      await vaultPage.open()

      await expect(vaultPage.tagsOf(position)).toHaveText(
        shitposts[position]?.tags ?? [],
      )
    },
  )
})

test.describe('media', () => {
  test(
    'serves every media file the gallery requests',
    { tag: '@smoke' },
    async ({ page, vaultPage }) => {
      // Observation only — no interception, so this measures what CloudFront
      // actually served rather than what a stub would have.
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

/**
 * The only tests that touch page.route.
 *
 * These are network fault injections, not mocks: the failure paths cannot be
 * reached against a healthy production API, and there is no other way to prove
 * the UI degrades honestly. Every other test here talks to real AWS.
 */
test.describe('failure states', () => {
  test(
    'announces that it is loading while the catalogue is in flight',
    { tag: '@regression' },
    async ({ page, vaultPage }) => {
      await page.route('**/api/shitposts', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        await route.continue()
      })

      await vaultPage.open()

      await expect(vaultPage.loadingMessage).toBeVisible()
      await expect(vaultPage.gallery).toBeVisible()
      await expect(vaultPage.loadingMessage).toBeHidden()
    },
  )

  test(
    'reports a failure and recovers when the catalogue is retried',
    { tag: '@regression' },
    async ({ page, vaultPage }) => {
      // Fail every request while the outage lasts, then lift it. Failing only
      // the first is not deterministic: StrictMode double-invokes the effect
      // in dev, so the 503 would land on the request React then aborts.
      await page.route('**/api/shitposts', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'catalogue unavailable' }),
        }),
      )

      await vaultPage.open()
      await expect(vaultPage.errorMessage).toBeVisible()

      await page.unroute('**/api/shitposts')
      await vaultPage.retryButton.click()

      await expect(vaultPage.gallery).toBeVisible()
      await expect(vaultPage.errorMessage).toBeHidden()
    },
  )

  test(
    'says the vault is empty when the catalogue holds nothing',
    { tag: '@regression' },
    async ({ page, vaultPage }) => {
      await page.route('**/api/shitposts', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ shitposts: [] }),
        }),
      )

      await vaultPage.open()

      await expect(vaultPage.emptyMessage).toBeVisible()
      await expect(vaultPage.catalogueSize).toHaveText('0 shitposts')
      await expect(vaultPage.gallery).toBeHidden()
    },
  )

  test(
    'reports a failure when the catalogue breaks its contract',
    { tag: '@regression' },
    async ({ page, vaultPage }) => {
      await page.route('**/api/shitposts', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ shitposts: [{ shitpostKey: 42 }] }),
        }),
      )

      await vaultPage.open()

      await expect(vaultPage.errorMessage).toBeVisible()
    },
  )
})

test.describe('contract', () => {
  test(
    'returns a catalogue matching the shape the frontend parses',
    { tag: '@api' },
    async ({ catalogue }) => {
      const { status, body } = await catalogue.listShitposts()

      expect(status).toBe(200)
      // Strict parse: an added, renamed or retyped field on the deployed API
      // fails here rather than degrading silently in the browser.
      expect(() => exactShitpostsResponseSchema.parse(body)).not.toThrow()
    },
  )

  test('orders the catalogue newest first', { tag: '@api' }, async ({
    catalogue,
  }) => {
    const { body } = await catalogue.listShitposts()
    const { shitposts } = exactShitpostsResponseSchema.parse(body)

    const uploadTimes = shitposts.map((shitpost) => shitpost.uploadedAt)
    expect(uploadTimes).toEqual([...uploadTimes].sort().reverse())
  })
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

  test(
    'gives every image a non-empty alt text',
    { tag: '@regression' },
    async ({ vaultPage }) => {
      await vaultPage.open()
      await expect(vaultPage.images.first()).toBeVisible()

      const altTexts = await vaultPage.images.evaluateAll((images) =>
        images.map((image) => image.getAttribute('alt') ?? ''),
      )

      expect(altTexts.length).toBeGreaterThan(0)
      expect(altTexts.filter((alt) => alt.trim() === '')).toEqual([])
    },
  )
})
