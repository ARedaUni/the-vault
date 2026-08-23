import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { Tile } from './Tile'
import type { Shitpost } from './shitposts.contract'
import { media } from './testing/shitposts.handlers'
import { mswBrowserWorker } from '../../test/msw.browser.setup'

const shitpostWith = (tags: readonly string[]): Shitpost => ({
  shitpostKey: 'media/cat.png',
  uploadedAt: '2026-03-09T11:20:00.000Z',
  tags: [...tags],
})

const renderTile = async (shitpost: Shitpost) => {
  mswBrowserWorker.use(media([shitpost]))
  return render(
    <ul aria-label="Shitposts" className="grid">
      <Tile shitpost={shitpost} />
    </ul>,
  )
}

describe('a tile', () => {
  it('describes the media by its tags', async () => {
    const screen = await renderTile(shitpostWith(['cats', 'chaos']))

    await expect
      .element(screen.getByAltText('Shitpost tagged cats, chaos'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('9 Mar 2026')).toBeVisible()
  })

  it('renders no tag list when the shitpost has no tags', async () => {
    const screen = await renderTile(shitpostWith([]))

    await expect
      .element(screen.getByAltText('Shitpost with no tags'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Tags' }))
      .not.toBeInTheDocument()
  })
})
