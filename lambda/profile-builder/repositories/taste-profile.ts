import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { TasteProfileRepository } from '../domain/taste-profile-repository';

export const dynamoDbTasteProfileRepository = (options: {
  client: DynamoDBDocumentClient;
  tableName: string;
}): TasteProfileRepository => ({
  incrementTag: async ({ userId, tag }) => {
    await options.client.send(
      new UpdateCommand({
        TableName: options.tableName,
        Key: { PK: `USER#${userId}`, SK: `PROFILE#TAG#${tag}` },
        UpdateExpression: 'ADD tally :one',
        ExpressionAttributeValues: { ':one': 1 },
      }),
    );
  },
});
