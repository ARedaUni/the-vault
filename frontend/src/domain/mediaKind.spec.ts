import { describe, expect, it } from 'vitest'
import { mediaKindOf } from './mediaKind'

describe('mediaKindOf', () => {
  it('reads a known video extension as video', () => {
    expect(mediaKindOf('media/clip.mp4')).toBe('video')
  })

  it('ignores extension casing', () => {
    expect(mediaKindOf('media/clip.MOV')).toBe('video')
  })

  it('falls back to image for a non-video extension', () => {
    expect(mediaKindOf('media/meme.png')).toBe('image')
  })

  it('falls back to image when the key carries no extension', () => {
    expect(mediaKindOf('media/meme')).toBe('image')
  })
})
