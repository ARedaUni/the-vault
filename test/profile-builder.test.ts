import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { createProfileBuilder } from '../lambda/profile-builder/triggers/stream';
import type { StreamRecord } from '../lambda/profile-builder/triggers/stream';
import { dynamoDbTasteProfileRepository } from '../lambda/profile-builder/adapters/taste-profile';
import type { TasteProfileRepository } from '../lambda/profile-builder/domain/taste-profile-repository';

const aSignalRecord = (
  overrides: Partial<{ eventName: string; item: Record<string, unknown> }> = {},
): StreamRecord => ({
  eventName: overrides.eventName ?? 'INSERT',
  dynamodb: {
    NewImage: marshall({
      PK: 'USER#ali',
      SK: 'SIGNAL#2026-08-02T14:02:00Z#media/cat.png',
      userId: 'ali',
      shitpostKey: 'media/cat.png',
      tags: ['cats', 'programming'],
      signalledAt: '2026-08-02T14:02:00Z',
      ...overrides.item,
    }),
  },
});

const recordingProfileRepository = (): TasteProfileRepository & {
  increments: readonly { userId: string; tag: string }[];
} => {
  const increments: { userId: string; tag: string }[] = [];
  return {
    increments,
    incrementTag: async (options) => {
      increments.push(options);
    },
  };
};

test('an inserted signal bumps the tally once for each of its tags', async () => {
  const profiles = recordingProfileRepository();
  const buildProfile = createProfileBuilder({ profiles });

  await buildProfile({ Records: [aSignalRecord()] });

  expect(profiles.increments).toEqual([
    { userId: 'ali', tag: 'cats' },
    { userId: 'ali', tag: 'programming' },
  ]);
});

test('catalogue changes on the stream leave the profile untouched', async () => {
  const profiles = recordingProfileRepository();
  const buildProfile = createProfileBuilder({ profiles });

  await buildProfile({
    Records: [
      aSignalRecord({
        item: { PK: 'SHITPOST', SK: 'media/cat.png', uploadedAt: '2026-08-02T14:00:00Z' },
      }),
    ],
  });

  expect(profiles.increments).toEqual([]);
});

test('modified and removed signals do not change the tally again', async () => {
  const profiles = recordingProfileRepository();
  const buildProfile = createProfileBuilder({ profiles });

  await buildProfile({
    Records: [
      aSignalRecord({ eventName: 'MODIFY' }),
      aSignalRecord({ eventName: 'REMOVE' }),
    ],
  });

  expect(profiles.increments).toEqual([]);
});

test('the DynamoDB profile repository counts atomically under a per-tag item', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  const updates: unknown[] = [];
  dynamoDb.on(UpdateCommand).callsFake((input) => {
    updates.push(input);
    return {};
  });

  const repository = dynamoDbTasteProfileRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
  await repository.incrementTag({ userId: 'ali', tag: 'cats' });

  expect(updates).toEqual([
    expect.objectContaining({
      TableName: 'TestCatalogue',
      Key: { PK: 'USER#ali', SK: 'PROFILE#TAG#cats' },
      UpdateExpression: 'ADD tally :one',
      ExpressionAttributeValues: { ':one': 1 },
    }),
  ]);
  dynamoDb.restore();
});
