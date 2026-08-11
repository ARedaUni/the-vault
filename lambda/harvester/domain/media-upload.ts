import type { StoredImage } from '../../shared/domain/media';

export type ImageDownloader = {
  download: (url: string) => Promise<StoredImage>;
};

export type MediaUpload = {
  store: (key: string, image: StoredImage) => Promise<void>;
};
