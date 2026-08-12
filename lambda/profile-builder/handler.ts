import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamoDbTasteProfileRepository } from './adapters/taste-profile';
import { createProfileBuilder } from './triggers/stream';

const environment = z
  .object({ CATALOGUE_TABLE_NAME: z.string().min(1) })
  .parse(process.env);

export const handler = createProfileBuilder({
  profiles: dynamoDbTasteProfileRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: environment.CATALOGUE_TABLE_NAME,
  }),
});
