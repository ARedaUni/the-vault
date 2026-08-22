import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../../lambda/shared/adapters/dynamodb-shitpost-repository';
import { createShitpostsHandler } from '../../lambda/catalogue/triggers/http';
import type {
  CanonicalRequestEvent,
  CataloguePorts,
  TelemetryOptions,
} from '../../lambda/catalogue/triggers/http';
import { shitpostSchema } from '../../lambda/shared/domain/shitpost';
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

export const aShitpost = (overrides: Partial<Shitpost> = {}): Shitpost =>
  shitpostSchema.parse({
    shitpostKey: 'media/default.png',
    uploadedAt: '2026-07-01T12:00:00Z',
    tags: ['memes'],
    ...overrides,
  });

export const inMemoryRepository = (
  seed: readonly Shitpost[] = [],
): ShitpostRepository => {
  let stored: readonly Shitpost[] = [...seed];
  const newestFirst = () =>
    [...stored]
      .filter((s) => s.deletedAt === undefined)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return {
    findAll: async () => stored,
    findLivePage: async ({ limit, cursor }) => {
      const live = newestFirst();
      const from = cursor === undefined ? 0 : Number(cursor);
      const shitposts = live.slice(from, from + limit);
      const next = from + shitposts.length;
      return {
        shitposts,
        ...(next < live.length ? { nextCursor: String(next) } : {}),
      };
    },
    getByKey: async (shitpostKey) =>
      stored.find((s) => s.shitpostKey === shitpostKey),
    save: async (shitpost) => {
      stored = [
        ...stored.filter((s) => s.shitpostKey !== shitpost.shitpostKey),
        shitpost,
      ];
    },
    markDeleted: async (shitpostKey, deletedAt) => {
      stored = stored.map((s) =>
        s.shitpostKey === shitpostKey ? { ...s, deletedAt } : s,
      );
    },
  };
};

/** Every port method rejects — for proving the handler's failure behaviour. */
export const alwaysFailingRepository = (error: Error): ShitpostRepository => ({
  findAll: async () => {
    throw error;
  },
  findLivePage: async () => {
    throw error;
  },
  getByKey: async () => {
    throw error;
  },
  save: async () => {
    throw error;
  },
  markDeleted: async () => {
    throw error;
  },
});

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

type Row = {
  PK: string;
  SK: string;
  uploadedAt: string;
  tags: readonly string[];
  liveMarker?: string;
  deletedAt?: string;
};

const toRow = (shitpost: Shitpost): Row => ({
  PK: 'SHITPOST',
  SK: shitpost.shitpostKey,
  uploadedAt: shitpost.uploadedAt,
  tags: shitpost.tags,
  ...(shitpost.deletedAt === undefined
    ? { liveMarker: 'LIVE' }
    : { deletedAt: shitpost.deletedAt }),
});

/**
 * Stands in for the `byUploadedAt` GSI. Sparse like the real thing — a row
 * without `liveMarker` is absent, not filtered — and it pages by
 * ExclusiveStartKey, so the adapter's cursor round-trip is genuinely exercised
 * rather than assumed.
 */
const queryTheIndex = (rows: readonly Row[], input: Record<string, any>) => {
  const indexed = rows
    .filter((row) => row.liveMarker !== undefined)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const ordered = input.ScanIndexForward === false ? [...indexed].reverse() : indexed;

  const startAfter =
    input.ExclusiveStartKey === undefined
      ? 0
      : ordered.findIndex((row) => row.SK === input.ExclusiveStartKey.SK) + 1;
  const page = ordered.slice(startAfter, startAfter + (input.Limit ?? ordered.length));
  const last = page[page.length - 1];
  const exhausted = startAfter + page.length >= ordered.length;

  return {
    Items: page,
    ...(exhausted || last === undefined
      ? {}
      : {
          LastEvaluatedKey: {
            PK: last.PK,
            SK: last.SK,
            liveMarker: last.liveMarker,
            uploadedAt: last.uploadedAt,
          },
        }),
  };
};

export const dynamoDbBackedRepository = (
  seed: readonly Shitpost[] = [],
): ShitpostRepository => {
  const rows = seed.map(toRow);
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb
    .on(QueryCommand, { TableName: 'TestCatalogue' })
    .callsFake((input) =>
      input.IndexName === undefined
        ? { Items: [...rows] }
        : queryTheIndex(rows, input),
    );
  dynamoDb
    .on(GetCommand, { TableName: 'TestCatalogue' })
    .callsFake((input) => ({
      Item: rows.find((candidate) => candidate.SK === input.Key.SK),
    }));
  dynamoDb
    .on(PutCommand, { TableName: 'TestCatalogue' })
    .callsFake((input) => {
      rows.push(input.Item);
      return {};
    });
  dynamoDb
    .on(UpdateCommand, { TableName: 'TestCatalogue' })
    .callsFake((input) => {
      const row = rows.find((candidate) => candidate.SK === input.Key.SK);
      if (row) {
        row.deletedAt = input.ExpressionAttributeValues[':deletedAt'];
        delete row.liveMarker;
      }
      return {};
    });
  return dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
};
