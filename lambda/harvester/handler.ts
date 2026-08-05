import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from '../catalogue/adapters/shitposts';
import { httpImageDownloader } from './adapters/http-image-download';
import { redditSavedPostSource } from './adapters/reddit-saved';
import { s3MediaUpload } from './adapters/s3-media-upload';
import { secretsManagerRedditCredentials } from './adapters/secrets-manager-credentials';
import { createHarvestSavedPosts } from './usecases/harvest-saved-posts';
import type { HarvestSummary } from './usecases/harvest-saved-posts';

const envSchema = z.object({
  CATALOGUE_TABLE_NAME: z.string().min(1),
  MEDIA_BUCKET_NAME: z.string().min(1),
  REDDIT_SECRET_ID: z.string().min(1),
});

const env = envSchema.parse(process.env);

const fetchCredentials = secretsManagerRedditCredentials({
  client: new SecretsManagerClient({}),
  secretId: env.REDDIT_SECRET_ID,
});

const shitposts = dynamoDbShitpostRepository({
  client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  tableName: env.CATALOGUE_TABLE_NAME,
});

const media = s3MediaUpload({
  client: new S3Client({}),
  bucketName: env.MEDIA_BUCKET_NAME,
});

const images = httpImageDownloader({ http: fetch });

export const handler = async (): Promise<HarvestSummary> => {
  const credentials = await fetchCredentials();
  const harvest = createHarvestSavedPosts({
    source: redditSavedPostSource({ http: fetch, credentials }),
    images,
    media,
    shitposts,
    now: () => new Date().toISOString(),
  });

  const summary = await harvest();
  console.log(JSON.stringify(summary));
  return summary;
};
