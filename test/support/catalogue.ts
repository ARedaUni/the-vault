import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../../lambda/shared/adapters/dynamodb-shitposts';
import { createShitpostsHandler } from '../../lambda/catalogue/routes/shitposts';
import type {
  CanonicalRequestEvent,
  CataloguePorts,
  TelemetryOptions,
} from '../../lambda/catalogue/routes/shitposts';
import type { Shitpost } from '../../lambda/shared/domain/shitpost';
import type { ShitpostRepository } from '../../lambda/shared/domain/shitpost-repository';
import type { Signal } from '../../lambda/shared/domain/signal';
import type { SignalRepository } from '../../lambda/catalogue/domain/signal-repository';
import type { TasteProfile, TasteProfileReader } from '../../lambda/catalogue/domain/taste-profile';

export const aCanonicalEvent = (
  overrides: Partial<CanonicalRequestEvent> = {},
): CanonicalRequestEvent => ({
  method: 'GET',
  path: '/shitposts',
  statusCode: 200,
  durationMs: 142,
  coldStart: false,
  requestId: 'req-123',
  repositoryDurationMs: 128,
  itemCount: 91,
  ...overrides,
});

export const aShitpost = (overrides: Partial<Shitpost> = {}): Shitpost => ({
  shitpostKey: 'media/default.png',
  uploadedAt: '2026-07-01T12:00:00Z',
  tags: ['memes'],
  ...overrides,
});

export const inMemoryRepository = (
  seed: readonly Shitpost[] = [],
): ShitpostRepository => {
  let stored: readonly Shitpost[] = [...seed];
  return {
    findAll: async () => stored,
    save: async (shitpost) => {
      stored = [
        ...stored.filter((s) => s.shitpostKey !== shitpost.shitpostKey),
        shitpost,
      ];
    },
  };
};

export const inMemorySignalRepository = (
  seed: readonly Signal[] = [],
): SignalRepository & { findAll: () => Promise<readonly Signal[]> } => {
  let stored: readonly Signal[] = [...seed];
  return {
    findAll: async () => stored,
    save: async (signal) => {
      stored = [...stored, signal];
    },
  };
};

export const inMemoryTasteProfiles = (
  profiles: Record<string, TasteProfile>,
): TasteProfileReader => ({
  findByUser: async (userId) => profiles[userId] ?? {},
});

type PortOverrides = Partial<CataloguePorts> & Pick<CataloguePorts, 'shitposts'>;

export const aCatalogueHandler = (
  ports: PortOverrides,
  options: TelemetryOptions = {},
) =>
  createShitpostsHandler(
    {
      signals: inMemorySignalRepository(),
      profiles: inMemoryTasteProfiles({}),
      ...ports,
    },
    options,
  );

const toRow = (shitpost: Shitpost) => ({
  PK: 'SHITPOST',
  SK: shitpost.shitpostKey,
  uploadedAt: shitpost.uploadedAt,
  tags: shitpost.tags,
});

export const dynamoDbBackedRepository = (
  seed: readonly Shitpost[] = [],
): ShitpostRepository => {
  const rows = seed.map(toRow);
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb
    .on(QueryCommand, { TableName: 'TestCatalogue' })
    .callsFake(() => ({ Items: [...rows] }));
  dynamoDb
    .on(PutCommand, { TableName: 'TestCatalogue' })
    .callsFake((input) => {
      rows.push(input.Item);
      return {};
    });
  return dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
};
