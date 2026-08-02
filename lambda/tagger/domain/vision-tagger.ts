import type { StoredImage } from './media-store';

export type VisionTagger = {
  suggestTags: (image: StoredImage) => Promise<string[]>;
};
