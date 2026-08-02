import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { TasteProfile, TasteProfileReader } from '../domain/taste-profile';

const PROFILE_TAG_PREFIX = 'PROFILE#TAG#';

const profileRowSchema = z.object({
  SK: z.string().startsWith(PROFILE_TAG_PREFIX),
  tally: z.number(),
});

export const dynamoDbTasteProfileReader = (options: {
  client: DynamoDBDocumentClient;
  tableName: string;
}): TasteProfileReader => ({
  findByUser: async (userId) => {
    const result = await options.client.send(
      new QueryCommand({
        TableName: options.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':prefix': PROFILE_TAG_PREFIX,
        },
      }),
    );

    return (result.Items ?? [])
      .map((item) => profileRowSchema.parse(item))
      .reduce<TasteProfile>(
        (profile, row) => ({
          ...profile,
          [row.SK.slice(PROFILE_TAG_PREFIX.length)]: row.tally,
        }),
        {},
      );
  },
});
