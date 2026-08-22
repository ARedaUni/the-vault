import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamoDbShitpostRepository } from '../shared/adapters/dynamodb-shitpost-repository';
import { dynamoDbSignalRepository } from './adapters/dynamodb-signal-repository';
import { dynamoDbTasteProfileReader } from './adapters/dynamodb-taste-profile-reader';
import { createShitpostsHandler } from './triggers/http';
import { emfFormat } from './telemetry/emf';
import { measuredShitpostRepository } from './telemetry/measured-shitpost-repository';

const environment = z
  .object({ CATALOGUE_TABLE_NAME: z.string().min(1) })
  .parse(process.env);

const { shitposts, drain } = measuredShitpostRepository(
  dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: environment.CATALOGUE_TABLE_NAME,
  }),
);

export const handler = createShitpostsHandler(
  {
    shitposts,
    signals: dynamoDbSignalRepository({
      client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      tableName: environment.CATALOGUE_TABLE_NAME,
    }),
    profiles: dynamoDbTasteProfileReader({
      client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      tableName: environment.CATALOGUE_TABLE_NAME,
    }),
  },
  {
    emit: (event) => console.log(emfFormat(event)),
    collect: drain,
  },
);
