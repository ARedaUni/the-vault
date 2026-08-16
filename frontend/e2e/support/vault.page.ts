import type { Locator, Page } from '@playwright/test'

/**
 * The Vault gallery. Locators are getters so they resolve at use time, never
 * at construction time; every one of them is semantic (role, label, text) so
 * the test fails when the accessibility tree breaks, not merely when a class
 * name changes.
 */
export class VaultPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 })
  }

  get catalogueSize(): Locator {
    return this.page.getByText(/\d+ shitposts?$/)
  }

  get gallery(): Locator {
    return this.page.getByRole('list', { name: 'Shitposts' })
  }

  /**
   * Direct children only — each tile carries its own nested tag list, so an
   * unscoped listitem lookup would also match every tag chip.
   */
  get tiles(): Locator {
    return this.gallery.locator(':scope > li')
  }

  get images(): Locator {
    return this.page.locator('[data-media-kind="image"]')
  }

  get videos(): Locator {
    return this.page.locator('[data-media-kind="video"]')
  }

  get loadingMessage(): Locator {
    return this.page.getByRole('status')
  }

  get errorMessage(): Locator {
    return this.page.getByRole('alert')
  }

  get retryButton(): Locator {
    return this.page.getByRole('button', { name: 'Try again' })
  }

  get emptyMessage(): Locator {
    return this.page.getByText('The vault is empty')
  }

  /** Opens the gallery and waits for the catalogue to settle. */
  async open(): Promise<void> {
    await this.page.goto('/')
  }

  /** The tag chips rendered on a single tile, by position in the grid. */
  tagsOf(position: number): Locator {
    return this.tiles
      .nth(position)
      .getByRole('list', { name: 'Tags' })
      .getByRole('listitem')
  }
}
