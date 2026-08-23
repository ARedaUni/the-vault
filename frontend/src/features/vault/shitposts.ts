import { config } from '../../config'
import {
  type Shitpost,
  type ShitpostPage,
  shitpostsResponseSchema,
} from './shitposts.contract'

export type { Shitpost, ShitpostPage }

export const mediaUrlFor = (shitpostKey: string): string =>
  `${config.mediaBaseUrl}/${shitpostKey.split('/').map(encodeURIComponent).join('/')}`

/**
 * Fetches one page. The page size is the API's to choose — this consumer sends
 * no `limit`, so the deployed default is what the gallery gets, and the
 * contract spec is what proves that default has not moved.
 *
 * `cursor` is passed back exactly as it arrived. Nothing here may parse one:
 * the API is free to change what it encodes.
 */
export const fetchShitposts = async (
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<ShitpostPage> => {
  const query = new URLSearchParams(
    options.cursor === undefined ? {} : { cursor: options.cursor },
  )
  const url = `${config.apiBaseUrl}/shitposts${query.size === 0 ? '' : `?${query}`}`
  const response = await fetch(url, { signal: options.signal })

  if (!response.ok) {
    throw new Error(`The shitposts API responded ${response.status}`)
  }

  return shitpostsResponseSchema.parse(await response.json())
}
