import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { shitpostSchema } from '../domain/shitpost';
import type { Shitpost } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';

const SHITPOST_PARTITION = 'SHITPOST';

const toShitpost = (item: Record<string, unknown>): Shitpost =>
  shitpostSchema.parse({ shitpostKey: item.SK, uploadedAt: item.uploadedAt });

const toItem = (shitpost: Shitpost): Record<string, unknown> => ({
  PK: SHITPOST_PARTITION,
  SK: shitpost.shitpostKey,
  uploadedAt: shitpost.uploadedAt,
});

export const dynamoDbShitpostRepository = (options: {
  client: DynamoDBDocumentClient;
  tableName: string;
}): ShitpostRepository => ({
  findAll: async () => {
    const result = await options.client.send(
      new QueryCommand({
        TableName: options.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': SHITPOST_PARTITION },
      }),
    );

    return (result.Items ?? []).map(toShitpost);
  },

  save: async (shitpost) => {
    await options.client.send(
      new PutCommand({
        TableName: options.tableName,
        Item: toItem(shitpost),
      }),
    );
  },
});
