import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { imageMediaTypeSchema } from '../../shared/domain/media';
import type { MediaStore } from '../domain/media-store';

export const s3MediaStore = (options: {
  client: S3Client;
  bucketName: string;
}): MediaStore => ({
  fetch: async (key) => {
    const result = await options.client.send(
      new GetObjectCommand({ Bucket: options.bucketName, Key: key }),
    );

    if (result.Body === undefined) {
      throw new Error(`media object ${key} has no body`);
    }

    return {
      bytes: await result.Body.transformToByteArray(),
      mediaType: imageMediaTypeSchema.parse(result.ContentType),
    };
  },
});
