import type { ShitpostRepository } from '../../catalogue/domain/shitpost-repository';
import type { MediaStore } from '../domain/media-store';
import type { VisionTagger } from '../domain/vision-tagger';

export type BackfillSummary = {
  tagged: number;
  skipped: number;
};

export const createBackfillTags =
  (options: {
    shitposts: ShitpostRepository;
    media: MediaStore;
    vision: VisionTagger;
  }) =>
  async (): Promise<BackfillSummary> => {
    const all = await options.shitposts.findAll();
    const untagged = all.filter((shitpost) => shitpost.tags.length === 0);

    for (const shitpost of untagged) {
      const image = await options.media.fetch(shitpost.shitpostKey);
      const tags = await options.vision.suggestTags(image);
      await options.shitposts.save({ ...shitpost, tags });
    }

    return { tagged: untagged.length, skipped: all.length - untagged.length };
  };
