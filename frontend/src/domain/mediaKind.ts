const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'] as const

export type MediaKind = 'image' | 'video'

export const mediaKindOf = (shitpostKey: string): MediaKind => {
  const extension = shitpostKey.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTENSIONS.some((candidate) => candidate === extension)
    ? 'video'
    : 'image'
}
