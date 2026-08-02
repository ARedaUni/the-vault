import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createProfileBuilder } from './build-profile';
import { dynamoDbTasteProfileRepository } from './repositories/taste-profile';

const environment = z
  .object({ CATALOGUE_TABLE_NAME: z.string().min(1) })
  .parse(process.env);

export const handler = createProfileBuilder(
  dynamoDbTasteProfileRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: environment.CATALOGUE_TABLE_NAME,
  }),
);
