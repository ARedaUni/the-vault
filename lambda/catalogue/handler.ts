import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from './repositories/shitposts';
import { createShitpostsHandler } from './routes/shitposts';
import { withRepositoryTelemetry } from './telemetry/repository-telemetry';

const environment = z
  .object({ CATALOGUE_TABLE_NAME: z.string().min(1) })
  .parse(process.env);

const { repository, drain } = withRepositoryTelemetry(
  dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: environment.CATALOGUE_TABLE_NAME,
  }),
);

export const handler = createShitpostsHandler(repository, {
  emit: (event) => console.log(JSON.stringify(event)),
  collect: drain,
});
