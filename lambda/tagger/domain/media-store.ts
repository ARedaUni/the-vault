import type { StoredImage } from '../../shared/domain/media';

export type MediaStore = {
  fetch: (key: string) => Promise<StoredImage>;
};
