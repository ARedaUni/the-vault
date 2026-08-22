import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { shitpostSchema } from '../domain/shitpost';
import type { Shitpost } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';

const toShitpost = (item: Record<string, unknown>): Shitpost =>
  shitpostSchema.parse({
    shitpostKey: item.SK,
    uploadedAt: item.uploadedAt,
    tags: item.tags,
    deletedAt: item.deletedAt,
  });

const SHITPOST_PARTITION = 'SHITPOST';

/**
 * The partition key of the `byUploadedAt` index, and a constant on purpose: one
 * partition holding every live shitpost is what makes a single Query able to
 * page the whole archive newest-first. Safe well past this hoard's size — AWS
 * puts the ceiling at 1000 WCU / 3000 RCU for a partition.
 */
const LIVE_MARKER = 'LIVE';

const LIVE_BY_UPLOADED_AT = 'byUploadedAt';

/**
 * DynamoDB's own `LastEvaluatedKey`, base64'd so it survives a query string.
 * Opaque to everyone above the adapter: nothing outside this file may read a
 * cursor's shape, or the pagination scheme becomes part of the public API.
 */
const encodeCursor = (lastEvaluatedKey: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url');

const decodeCursor = (cursor: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(cursor, 'base64url').toString());

const toItem = (shitpost: Shitpost): Record<string, unknown> => ({
  PK: SHITPOST_PARTITION,
  SK: shitpost.shitpostKey,
  uploadedAt: shitpost.uploadedAt,
  tags: shitpost.tags,
  // Carried deliberately: a save that dropped it would resurrect a deleted
  // shitpost the moment the tagger wrote its tags back.
  ...(shitpost.deletedAt === undefined
    ? { liveMarker: LIVE_MARKER }
    : { deletedAt: shitpost.deletedAt }),
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

  findLivePage: async ({ limit, cursor }) => {
    const result = await options.client.send(
      new QueryCommand({
        TableName: options.tableName,
        IndexName: LIVE_BY_UPLOADED_AT,
        KeyConditionExpression: 'liveMarker = :marker',
        ExpressionAttributeValues: { ':marker': LIVE_MARKER },
        // The index is sorted oldest-first; the gallery wants the opposite.
        ScanIndexForward: false,
        Limit: limit,
        ...(cursor === undefined ? {} : { ExclusiveStartKey: decodeCursor(cursor) }),
      }),
    );

    return {
      shitposts: (result.Items ?? []).map(toShitpost),
      ...(result.LastEvaluatedKey === undefined
        ? {}
        : { nextCursor: encodeCursor(result.LastEvaluatedKey) }),
    };
  },

  getByKey: async (shitpostKey) => {
    const result = await options.client.send(
      new GetCommand({
        TableName: options.tableName,
        Key: { PK: SHITPOST_PARTITION, SK: shitpostKey },
      }),
    );

    return result.Item === undefined ? undefined : toShitpost(result.Item);
  },

  markDeleted: async (shitpostKey, deletedAt) => {
    await options.client.send(
      new UpdateCommand({
        TableName: options.tableName,
        Key: { PK: SHITPOST_PARTITION, SK: shitpostKey },
        // REMOVE, not a flag: the index is sparse, so stripping the marker is
        // what evicts the tombstone from `byUploadedAt` entirely.
        UpdateExpression: 'SET deletedAt = :deletedAt REMOVE liveMarker',
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
