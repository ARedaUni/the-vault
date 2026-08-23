import type { APIRequestContext } from '@playwright/test'

export type ApiResponse = {
  status: number
  body: unknown
}

export type CatalogueClient = {
  listShitposts(page?: { limit?: number; cursor?: string }): Promise<ApiResponse>
}

/**
 * Talks to the catalogue through the same origin the browser uses, so the test
 * exercises the real proxy and the real deployed API rather than a stub.
 */
export const catalogueClient = (
  request: APIRequestContext,
): CatalogueClient => ({
  async listShitposts(page = {}): Promise<ApiResponse> {
    const response = await request.get('/api/shitposts', {
      params: {
        ...(page.limit === undefined ? {} : { limit: page.limit }),
        ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
      },
    })
    return { status: response.status(), body: await response.json() }
  },
})
