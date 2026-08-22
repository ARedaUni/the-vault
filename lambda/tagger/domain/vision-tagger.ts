import type { StoredImage } from '../../shared/domain/media';

export interface VisionTagger {
  suggestTags(image: StoredImage): Promise<string[]>;
}
