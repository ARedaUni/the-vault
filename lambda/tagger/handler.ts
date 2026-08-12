import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from '../shared/adapters/dynamodb-shitposts';
import { bedrockVisionTagger } from './adapters/bedrock-vision';
import { s3MediaStore } from './adapters/s3-media';
import { createTagger } from './triggers/invocation';

const environment = z
  .object({
    CATALOGUE_TABLE_NAME: z.string().min(1),
    MEDIA_BUCKET_NAME: z.string().min(1),
    VISION_MODEL_ID: z.string().min(1),
  })
  .parse(process.env);

const bedrock = new AnthropicBedrock({ maxRetries: 10 });

export const handler = createTagger(
  {
    shitposts: dynamoDbShitpostRepository({
      client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      tableName: environment.CATALOGUE_TABLE_NAME,
    }),
    media: s3MediaStore({
      client: new S3Client({}),
      bucketName: environment.MEDIA_BUCKET_NAME,
    }),
    vision: bedrockVisionTagger({
      client: { messages: { create: (params) => bedrock.messages.create(params) } },
      model: environment.VISION_MODEL_ID,
    }),
  },
  { report: (summary) => console.log(JSON.stringify(summary)) },
);
