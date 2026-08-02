import { z } from 'zod';

export const imageMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export type ImageMediaType = z.infer<typeof imageMediaTypeSchema>;

export type StoredImage = {
  bytes: Uint8Array;
  mediaType: ImageMediaType;
};

export type MediaStore = {
  fetch: (key: string) => Promise<StoredImage>;
};
