import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from './repositories/shitposts';
import { createShitpostsHandler } from './routes/shitposts';

const environment = z
  .object({ CATALOGUE_TABLE_NAME: z.string().min(1) })
  .parse(process.env);

export const handler = createShitpostsHandler(
  dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: environment.CATALOGUE_TABLE_NAME,
  }),
);
