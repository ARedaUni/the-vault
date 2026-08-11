import type { Shitpost } from '../../shared/domain/shitpost';
import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';
import type { MediaStore } from '../domain/media-store';
import type { VisionTagger } from '../domain/vision-tagger';

export type TaggerPorts = {
  shitposts: ShitpostRepository;
  media: MediaStore;
  vision: VisionTagger;
};

export const createTagShitpost =
  (options: TaggerPorts) =>
  async (shitpost: Shitpost): Promise<boolean> => {
    if (shitpost.tags.length > 0) {
      return false;
    }

    const image = await options.media.fetch(shitpost.shitpostKey);
    const tags = await options.vision.suggestTags(image);
    await options.shitposts.save({ ...shitpost, tags });
    return true;
  };
