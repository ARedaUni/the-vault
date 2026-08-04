import { createHarvestSavedPosts } from '../lambda/harvester/usecases/harvest-saved-posts';
import type { SavedPost } from '../lambda/harvester/domain/saved-post';
import type { StoredImage } from '../lambda/tagger/domain/media-store';
import { aShitpost, inMemoryRepository } from './support/catalogue';

const aSavedPost = (overrides: Partial<SavedPost> = {}): SavedPost => ({
  redditId: 'abc123',
  imageUrl: 'https://i.redd.it/abc123.jpg',
  ...overrides,
});

const anImage = (overrides: Partial<StoredImage> = {}): StoredImage => ({
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: 'image/jpeg',
  ...overrides,
});

const inMemoryMediaUpload = () => {
  let stored: Readonly<Record<string, StoredImage>> = {};
  return {
    store: async (key: string, image: StoredImage) => {
      stored = { ...stored, [key]: image };
    },
    storedKeys: () => Object.keys(stored),
  };
};

const fixedClock = () => '2026-08-04T09:00:00.000Z';

describe('harvest saved posts', () => {
  it('stores a saved image in the media store and catalogue with no tags', async () => {
    const shitposts = inMemoryRepository();
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: { fetchSaved: async () => [aSavedPost()] },
      images: { download: async () => anImage() },
      media,
      shitposts,
      now: fixedClock,
    });

    const summary = await harvest();

    expect(summary).toEqual({ harvested: 1, skipped: 0, failed: 0 });
    expect(media.storedKeys()).toEqual(['reddit/abc123.jpg']);
    expect(await shitposts.findAll()).toEqual([
      {
        shitpostKey: 'reddit/abc123.jpg',
        uploadedAt: '2026-08-04T09:00:00.000Z',
        tags: [],
      },
    ]);
  });

  it('skips posts whose derived key already exists in the catalogue', async () => {
    const shitposts = inMemoryRepository([
      aShitpost({ shitpostKey: 'reddit/abc123.jpg', tags: ['spongebob'] }),
    ]);
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: {
        fetchSaved: async () => [
          aSavedPost(),
          aSavedPost({ redditId: 'zzz999', imageUrl: 'https://i.redd.it/zzz999.png' }),
        ],
      },
      images: { download: async () => anImage() },
      media,
      shitposts,
      now: fixedClock,
    });

    const summary = await harvest();

    expect(summary).toEqual({ harvested: 1, skipped: 1, failed: 0 });
    expect(media.storedKeys()).toEqual(['reddit/zzz999.png']);
    expect(await shitposts.findAll()).toContainEqual(
      aShitpost({ shitpostKey: 'reddit/abc123.jpg', tags: ['spongebob'] }),
    );
  });

  it('counts a post whose download fails without abandoning the rest', async () => {
    const shitposts = inMemoryRepository();
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: {
        fetchSaved: async () => [
          aSavedPost({ redditId: 'dead01', imageUrl: 'https://i.redd.it/dead01.jpg' }),
          aSavedPost({ redditId: 'alive2', imageUrl: 'https://i.redd.it/alive2.png' }),
        ],
      },
      images: {
        download: async (url) => {
          if (url.includes('dead01')) throw new Error('404 from reddit');
          return anImage();
        },
      },
      media,
      shitposts,
      now: fixedClock,
    });

    const summary = await harvest();

    expect(summary).toEqual({ harvested: 1, skipped: 0, failed: 1 });
    expect(media.storedKeys()).toEqual(['reddit/alive2.png']);
  });
});
