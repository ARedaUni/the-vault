import { config } from '../config'
import { type Shitpost, shitpostsResponseSchema } from './catalogue.contract'

export type { Shitpost }

export const mediaUrlFor = (shitpostKey: string): string =>
  `${config.mediaBaseUrl}/${shitpostKey.split('/').map(encodeURIComponent).join('/')}`

export const fetchShitposts = async (
  signal?: AbortSignal,
): Promise<readonly Shitpost[]> => {
  const response = await fetch(`${config.apiBaseUrl}/shitposts`, { signal })

  if (!response.ok) {
    throw new Error(`The catalogue responded ${response.status}`)
  }

  return shitpostsResponseSchema.parse(await response.json()).shitposts
}
