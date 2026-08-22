import type { StoredImage } from '../../shared/domain/media';

export interface ImageDownloader {
  download(url: string): Promise<StoredImage>;
}

export interface MediaUpload {
  store(key: string, image: StoredImage): Promise<void>;
}
