import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from '../catalogue/repositories/shitposts';
import { bedrockVisionTagger } from './repositories/bedrock-vision';
import { s3MediaStore } from './repositories/s3-media';
import { createBackfillTags } from './usecases/backfill-tags';
import type { BackfillSummary } from './usecases/backfill-tags';

const envSchema = z.object({
  CATALOGUE_TABLE_NAME: z.string().min(1),
  MEDIA_BUCKET_NAME: z.string().min(1),
  VISION_MODEL_ID: z.string().min(1),
});

const env = envSchema.parse(process.env);

const bedrock = new AnthropicBedrock();

const backfillTags = createBackfillTags({
  shitposts: dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: env.CATALOGUE_TABLE_NAME,
  }),
  media: s3MediaStore({
    client: new S3Client({}),
    bucketName: env.MEDIA_BUCKET_NAME,
  }),
  vision: bedrockVisionTagger({
    client: { messages: { create: (params) => bedrock.messages.create(params) } },
    model: env.VISION_MODEL_ID,
  }),
});

export const handler = async (): Promise<BackfillSummary> => {
  const summary = await backfillTags();
  console.log(JSON.stringify(summary));
  return summary;
};
