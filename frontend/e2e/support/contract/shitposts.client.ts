import type { APIRequestContext } from '@playwright/test'
import { shitpostPath } from '../../../src/features/vault/api/shitposts.contract.js'

export type ApiResponse = {
  status: number
  body: unknown
}

export type ShitpostsClient = {
  listShitposts(page?: { limit?: number; cursor?: string }): Promise<ApiResponse>
  deleteShitpost(shitpostKey: string): Promise<ApiResponse>
}

/**
 * Talks to the API through the same origin the browser uses, so the test
 * exercises the real proxy and the real deployed API rather than a stub.
 */
export const shitpostsClient = (
  request: APIRequestContext,
): ShitpostsClient => ({
  async listShitposts(page = {}): Promise<ApiResponse> {
    const response = await request.get('/api/shitposts', {
      params: {
        ...(page.limit === undefined ? {} : { limit: page.limit }),
        ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
      },
    })
    return { status: response.status(), body: await response.json() }
  },

  async deleteShitpost(shitpostKey): Promise<ApiResponse> {
    const response = await request.delete(`/api${shitpostPath(shitpostKey)}`)
    return { status: response.status(), body: await response.text() }
  },
})
