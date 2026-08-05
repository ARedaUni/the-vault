import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { MediaUpload } from '../domain/media-upload';

export const s3MediaUpload = (options: {
  client: S3Client;
  bucketName: string;
}): MediaUpload => ({
  store: async (key, image) => {
    await options.client.send(
      new PutObjectCommand({
        Bucket: options.bucketName,
        Key: key,
        Body: image.bytes,
        ContentType: image.mediaType,
      }),
    );
  },
});
