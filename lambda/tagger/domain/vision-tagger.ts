import type { StoredImage } from '../../shared/domain/media';

export type VisionTagger = {
  suggestTags: (image: StoredImage) => Promise<string[]>;
};
