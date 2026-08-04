import type { ShitpostRepository } from '../../catalogue/domain/shitpost-repository';
import type { ImageDownloader, MediaUpload } from '../domain/media-upload';
import type { SavedPost, SavedPostSource } from '../domain/saved-post';

export type HarvestSummary = {
  harvested: number;
  skipped: number;
  failed: number;
};

export type HarvesterPorts = {
  source: SavedPostSource;
  images: ImageDownloader;
  media: MediaUpload;
  shitposts: ShitpostRepository;
  now: () => string;
};

const shitpostKeyFor = (post: SavedPost): string => {
  const extension = new URL(post.imageUrl).pathname.match(/\.[a-z]+$/i)?.[0] ?? '';
  return `reddit/${post.redditId}${extension}`;
};

export const createHarvestSavedPosts = (options: HarvesterPorts) => {
  const { source, images, media, shitposts, now } = options;

  return async (): Promise<HarvestSummary> => {
    const saved = await source.fetchSaved();
    const existingKeys = new Set(
      (await shitposts.findAll()).map((shitpost) => shitpost.shitpostKey),
    );

    let harvested = 0;
    let skipped = 0;
    let failed = 0;
    for (const post of saved) {
      const shitpostKey = shitpostKeyFor(post);
      if (existingKeys.has(shitpostKey)) {
        skipped += 1;
        continue;
      }

      try {
        const image = await images.download(post.imageUrl);
        await media.store(shitpostKey, image);
        await shitposts.save({ shitpostKey, uploadedAt: now(), tags: [] });
        harvested += 1;
      } catch (error) {
        failed += 1;
        console.error(JSON.stringify({ failedKey: shitpostKey, error: String(error) }));
      }
    }

    return { harvested, skipped, failed };
  };
};
