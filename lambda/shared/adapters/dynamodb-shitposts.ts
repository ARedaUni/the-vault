import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { shitpostSchema } from '../domain/shitpost';
import type { Shitpost } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';

const SHITPOST_PARTITION = 'SHITPOST';

const toShitpost = (item: Record<string, unknown>): Shitpost =>
  shitpostSchema.parse({
    shitpostKey: item.SK,
    uploadedAt: item.uploadedAt,
    tags: item.tags,
    deletedAt: item.deletedAt,
  });

const toItem = (shitpost: Shitpost): Record<string, unknown> => ({
  PK: SHITPOST_PARTITION,
  SK: shitpost.shitpostKey,
  uploadedAt: shitpost.uploadedAt,
  tags: shitpost.tags,
  // Carried deliberately: a save that dropped it would resurrect a deleted
  // shitpost the moment the tagger wrote its tags back.
  ...(shitpost.deletedAt === undefined ? {} : { deletedAt: shitpost.deletedAt }),
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

  findLive: async () => {
    const result = await options.client.send(
      new QueryCommand({
        TableName: options.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': SHITPOST_PARTITION },
      }),
    );

    return (result.Items ?? [])
      .map(toShitpost)
      .filter((shitpost) => shitpost.deletedAt === undefined);
  },

  markDeleted: async (shitpostKey, deletedAt) => {
    await options.client.send(
      new UpdateCommand({
        TableName: options.tableName,
        Key: { PK: SHITPOST_PARTITION, SK: shitpostKey },
        UpdateExpression: 'SET deletedAt = :deletedAt',
        ExpressionAttributeValues: { ':deletedAt': deletedAt },
        ConditionExpression: 'attribute_exists(SK)',
      }),
    );
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
