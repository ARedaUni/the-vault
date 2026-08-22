import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from './App'
import { capturedCatalogue } from '@/test/catalogue.fixture'
import { catalogue, healthyCatalogue, media } from '@/test/catalogue.handlers'
import { mswBrowserWorker } from '@/test/msw.browser.setup'

/**
 * The Vault's behaviour, one API response at a time.
 *
 * Real Chromium, real `fetch`, real `useCatalogue` — only the network is
 * answered from a handler. Everything here asks "given this response, what
 * does the user see", which needs no dev server and no navigation, so none of
 * it belongs in Playwright. See docs/testing-strategy.md.
 */

describe('the catalogue loads', () => {
  it('renders one tile per shitpost the catalogue returns', async () => {
    mswBrowserWorker.use(...healthyCatalogue())

    const screen = await render(<App />)

    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(`${capturedCatalogue.length} shitposts`))
      .toBeInTheDocument()
  })

  it('renders every tile as either an image or a video', async () => {
    mswBrowserWorker.use(...healthyCatalogue())

    const screen = await render(<App />)
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()

    const images = screen.container.querySelectorAll('[data-media-kind="image"]')
    const videos = screen.container.querySelectorAll('[data-media-kind="video"]')

    expect(images.length + videos.length).toBe(capturedCatalogue.length)
  })

  it('shows the tags the catalogue holds for a shitpost', async () => {
    // The fixture is captured, so this index is a fact about real data rather
    // than a runtime search that could skip itself into vacuous success.
    const position = capturedCatalogue.findIndex(
      (shitpost) => shitpost.tags.length > 0,
    )
    const expected = capturedCatalogue[position]?.tags ?? []
    mswBrowserWorker.use(...healthyCatalogue())

    const screen = await render(<App />)
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()

    const tags = screen
      .getByRole('list', { name: 'Shitposts' })
      .getByRole('listitem')
      .nth(position)
      .getByRole('list', { name: 'Tags' })

    for (const tag of expected) {
      await expect
        .element(tags.getByText(tag, { exact: true }))
        .toBeInTheDocument()
    }
  })
})

describe('the catalogue is slow, empty or broken', () => {
  it('announces that it is loading while the catalogue is in flight', async () => {
    mswBrowserWorker.use(catalogue.stalls(500), media())

    const screen = await render(<App />)

    await expect.element(screen.getByRole('status')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument()
  })

  it('reports a failure and recovers when the catalogue is retried', async () => {
    mswBrowserWorker.use(catalogue.fails(503))

    const screen = await render(<App />)
    await expect.element(screen.getByRole('alert')).toBeInTheDocument()

    mswBrowserWorker.use(...healthyCatalogue())
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  })

  it('says the vault is empty when the catalogue holds nothing', async () => {
    mswBrowserWorker.use(catalogue.serves([]))

    const screen = await render(<App />)

    await expect
      .element(screen.getByText('The vault is empty.'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('0 shitposts')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .not.toBeInTheDocument()
  })

  it('reports a failure when the catalogue breaks its contract', async () => {
    // A 200 the app cannot parse must fail like an outage, not render blanks.
    mswBrowserWorker.use(catalogue.breaksContract())

    const screen = await render(<App />)

    await expect.element(screen.getByRole('alert')).toBeInTheDocument()
  })
})
