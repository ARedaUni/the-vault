import type { StoredImage } from '../../shared/domain/media';

export interface MediaStore {
  fetch(key: string): Promise<StoredImage>;
}
