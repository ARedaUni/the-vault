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

  get shitpostCount(): Locator {
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

  /** Opens the gallery and waits for the shitposts to settle. */
  async open(): Promise<void> {
    await this.page.goto('/')
  }
}
