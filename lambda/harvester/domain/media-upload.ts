import type { StoredImage } from '../../tagger/domain/media-store';

export type ImageDownloader = {
  download: (url: string) => Promise<StoredImage>;
};

export type MediaUpload = {
  store: (key: string, image: StoredImage) => Promise<void>;
};
