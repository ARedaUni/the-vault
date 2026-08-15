import { expect, test } from '@playwright/test'

test('the vault renders every shitpost the catalogue holds', async ({ page }) => {
  const catalogue = await page.request.get('/api/shitposts')
  const { shitposts } = (await catalogue.json()) as { shitposts: { shitpostKey: string }[] }
  expect(shitposts.length).toBeGreaterThan(0)

  await page.goto('/')

  await expect(page.getByRole('heading')).toContainText(`${shitposts.length} shitposts`)
  await expect(page.locator('#grid img, #grid video')).toHaveCount(shitposts.length)
})

test('images are actually served, not broken links', async ({ page }) => {
  const mediaStatuses: number[] = []
  await page.route('**/media/**', async (route) => {
    const response = await route.fetch()
    mediaStatuses.push(response.status())
    await route.fulfill({ response })
  })

  await page.goto('/')

  await expect.poll(() => mediaStatuses.length).toBeGreaterThan(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })

  expect(mediaStatuses).not.toContain(404)
  expect(mediaStatuses.every((status) => status === 200)).toBe(true)
})
