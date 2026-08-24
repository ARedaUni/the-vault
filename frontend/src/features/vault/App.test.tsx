import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from './App'
import { mediaUrlFor } from './api/shitposts'
import { capturedShitposts, manyShitposts } from './testing/shitposts.fixture'
import { shitposts, healthyShitposts, media } from './testing/shitposts.handlers'
import { mswBrowserWorker } from '../../test/msw.browser.setup'

/**
 * The Vault's behaviour, one API response at a time.
 *
 * Real Chromium, real `fetch`, real `useShitposts` — only the network is
 * answered from a handler. Everything here asks "given this response, what
 * does the user see", which needs no dev server and no navigation, so none of
 * it belongs in Playwright. See docs/testing-strategy.md.
 */

describe('the gallery loads', () => {
  it('renders one tile per shitpost the API returns', async () => {
    mswBrowserWorker.use(...healthyShitposts())

    const screen = await render(<App />)

    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(`${capturedShitposts.length} shitposts`))
      .toBeInTheDocument()
  })

  it('renders every tile as either an image or a video', async () => {
    mswBrowserWorker.use(...healthyShitposts())

    const screen = await render(<App />)
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()

    const images = screen.container.querySelectorAll('[data-media-kind="image"]')
    const videos = screen.container.querySelectorAll('[data-media-kind="video"]')

    expect(images.length + videos.length).toBe(capturedShitposts.length)
  })

  it('appends the next page when asked for more', async () => {
    // Thirty against a twenty-a-page API: one page held back, so the count
    // moving from 20 to 30 can only mean the app asked for the second page
    // and kept the first. A fake that served all thirty at once would make
    // this pass without any paging in the app at all.
    const hoard = manyShitposts(30)
    mswBrowserWorker.use(shitposts.serves(hoard), media(hoard))

    const screen = await render(<App />)
    await expect.element(screen.getByText('20 shitposts')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await expect.element(screen.getByText('30 shitposts')).toBeInTheDocument()
  })

  it('offers nothing more to load once the API is out of pages', async () => {
    mswBrowserWorker.use(...healthyShitposts())

    const screen = await render(<App />)
    await expect
      .element(screen.getByText(`${capturedShitposts.length} shitposts`))
      .toBeInTheDocument()

    await expect
      .element(screen.getByRole('button', { name: 'Load more' }))
      .not.toBeInTheDocument()
  })

  it('shows the tags the API holds for a shitpost', async () => {
    // The fixture is captured, so this index is a fact about real data rather
    // than a runtime search that could skip itself into vacuous success.
    const position = capturedShitposts.findIndex(
      (shitpost) => shitpost.tags.length > 0,
    )
    const expected = capturedShitposts[position]?.tags ?? []
    mswBrowserWorker.use(...healthyShitposts())

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

describe('the API is slow, empty or broken', () => {
  it('announces that it is loading while the request is in flight', async () => {
    mswBrowserWorker.use(shitposts.stalls(500), media())

    const screen = await render(<App />)

    await expect.element(screen.getByRole('status')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument()
  })

  it('reports a failure and recovers when the API is retried', async () => {
    mswBrowserWorker.use(shitposts.fails(503))

    const screen = await render(<App />)
    await expect.element(screen.getByRole('alert')).toBeInTheDocument()

    mswBrowserWorker.use(...healthyShitposts())
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .toBeInTheDocument()
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  })

  it('says the vault is empty when the API holds nothing', async () => {
    mswBrowserWorker.use(shitposts.serves([]))

    const screen = await render(<App />)

    await expect
      .element(screen.getByText('The vault is empty.'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('0 shitposts')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Shitposts' }))
      .not.toBeInTheDocument()
  })

  it('reports a failure when the API breaks its contract', async () => {
    // A 200 the app cannot parse must fail like an outage, not render blanks.
    mswBrowserWorker.use(shitposts.breaksContract())

    const screen = await render(<App />)

    await expect.element(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('deleting a shitpost', () => {
  it('removes the tile once the API confirms the deletion', async () => {
    mswBrowserWorker.use(...healthyShitposts())
    const doomed = capturedShitposts[0]?.shitpostKey ?? ''

    const screen = await render(<App />)
    await expect
      .element(screen.getByText(`${capturedShitposts.length} shitposts`))
      .toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Delete/ }).first())

    await expect
      .element(screen.getByText(`${capturedShitposts.length - 1} shitposts`))
      .toBeInTheDocument()
    // The fake 404s any key the API does not hold, so the count can only drop
    // if the app sent the key of the tile that was clicked.
    expect(
      screen.container.querySelector(`[src="${mediaUrlFor(doomed)}"]`),
    ).toBeNull()
  })

  it('keeps the tile and reports it when the API refuses to delete', async () => {
    mswBrowserWorker.use(shitposts.refusesToDelete(503), ...healthyShitposts())
    const doomed = capturedShitposts[0]?.shitpostKey ?? ''

    const screen = await render(<App />)
    await expect
      .element(screen.getByText(`${capturedShitposts.length} shitposts`))
      .toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Delete/ }).first())

    await expect.element(screen.getByRole('alert')).toBeInTheDocument()
    await expect
      .element(screen.getByText(`${capturedShitposts.length} shitposts`))
      .toBeInTheDocument()
    expect(
      screen.container.querySelector(`[src="${mediaUrlFor(doomed)}"]`),
    ).not.toBeNull()
  })
})
