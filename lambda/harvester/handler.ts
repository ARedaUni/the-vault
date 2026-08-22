import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from '../shared/adapters/dynamodb-shitpost-repository';
import { httpImageDownloader } from './adapters/http-image-downloader';
import { redditFeedSavedPostSource } from './adapters/reddit-feed-saved-post-source';
import { s3MediaUpload } from './adapters/s3-media-upload';
import { secretsManagerFeedUrl } from './adapters/secrets-manager-feed-url';
import { createScheduledHarvest } from './triggers/schedule';

const environment = z
  .object({
    CATALOGUE_TABLE_NAME: z.string().min(1),
    MEDIA_BUCKET_NAME: z.string().min(1),
    REDDIT_SECRET_ID: z.string().min(1),
  })
  .parse(process.env);

export const handler = createScheduledHarvest(
  {
    source: redditFeedSavedPostSource({
      http: fetch,
      feedUrl: secretsManagerFeedUrl({
        client: new SecretsManagerClient({}),
        secretId: environment.REDDIT_SECRET_ID,
      }),
    }),
    images: httpImageDownloader({ http: fetch }),
    media: s3MediaUpload({
      client: new S3Client({}),
      bucketName: environment.MEDIA_BUCKET_NAME,
    }),
    shitposts: dynamoDbShitpostRepository({
      client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      tableName: environment.CATALOGUE_TABLE_NAME,
    }),
    now: () => new Date().toISOString(),
  },
  { report: (summary) => console.log(JSON.stringify(summary)) },
);
