import { type Shitpost, mediaUrlFor } from './api/shitposts'
import { mediaKindOf } from './mediaKind'

const uploadedOn = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const describe = (tags: readonly string[]): string =>
  tags.length > 0
    ? `Shitpost tagged ${tags.join(', ')}`
    : 'Shitpost with no tags'

const Media = ({ shitpostKey, tags }: Shitpost) => {
  const source = mediaUrlFor(shitpostKey)
  const description = describe(tags)

  return mediaKindOf(shitpostKey) === 'video' ? (
    <video
      data-media-kind="video"
      src={source}
      aria-label={description}
      controls
      muted
      playsInline
      preload="metadata"
    />
  ) : (
    <img
      data-media-kind="image"
      src={source}
      alt={description}
      loading="lazy"
      decoding="async"
    />
  )
}

export const Tile = ({ shitpost }: { shitpost: Shitpost }) => (
  <li className="tile">
    <figure>
      <Media {...shitpost} />
      <figcaption>
        <time dateTime={shitpost.uploadedAt}>
          {uploadedOn.format(new Date(shitpost.uploadedAt))}
        </time>
        {shitpost.tags.length > 0 && (
          <ul aria-label="Tags" className="tags">
            {shitpost.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  </li>
)
