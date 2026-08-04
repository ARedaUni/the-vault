import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Signal } from '../domain/signal';
import type { SignalRepository } from '../domain/signal-repository';

const toItem = (signal: Signal): Record<string, unknown> => ({
  PK: `USER#${signal.userId}`,
  SK: `SIGNAL#${signal.signalledAt}#${signal.shitpostKey}`,
  userId: signal.userId,
  shitpostKey: signal.shitpostKey,
  tags: signal.tags,
  signalledAt: signal.signalledAt,
});

export const dynamoDbSignalRepository = (options: {
  client: DynamoDBDocumentClient;
  tableName: string;
}): SignalRepository => ({
  save: async (signal) => {
    await options.client.send(
      new PutCommand({
        TableName: options.tableName,
        Item: toItem(signal),
      }),
    );
  },
});
