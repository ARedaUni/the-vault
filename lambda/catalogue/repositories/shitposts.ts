import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { shitpostSchema } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';

export const dynamoDbShitpostRepository = (options: {
  client: DynamoDBDocumentClient;
  tableName: string;
}): ShitpostRepository => ({
  findAll: async () => {
    const result = await options.client.send(
      new QueryCommand({
        TableName: options.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'SHITPOST' },
      }),
    );

    return (result.Items ?? []).map((item) =>
      shitpostSchema.parse({ shitpostKey: item.SK, uploadedAt: item.uploadedAt }),
    );
  },

  save: async (shitpost) => {
    await options.client.send(
      new PutCommand({
        TableName: options.tableName,
        Item: {
          PK: 'SHITPOST',
          SK: shitpost.shitpostKey,
          uploadedAt: shitpost.uploadedAt,
        },
      }),
    );
  },
});
