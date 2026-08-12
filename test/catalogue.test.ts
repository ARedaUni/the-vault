import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../lambda/shared/adapters/dynamodb-shitposts';
import { dynamoDbSignalRepository } from '../lambda/catalogue/adapters/signals';
import { dynamoDbTasteProfileReader } from '../lambda/catalogue/adapters/taste-profiles';
import type { CatalogueEvent } from '../lambda/catalogue/triggers/http';
import type { Shitpost } from '../lambda/shared/domain/shitpost';
import type { ShitpostRepository } from '../lambda/shared/domain/shitpost-repository';
import { withRepositoryTelemetry } from '../lambda/catalogue/telemetry/repository-telemetry';
import { emfFormat } from '../lambda/catalogue/telemetry/emf';
import {
  aCanonicalEvent,
  aCatalogueHandler,
  aShitpost,
  dynamoDbBackedRepository,
  inMemoryRepository,
  inMemorySignalRepository,
  inMemoryTasteProfiles,
} from './support/catalogue';

const aRequest = (overrides: Partial<CatalogueEvent> = {}): CatalogueEvent => ({
  requestContext: { http: { method: 'GET' } },
  ...overrides,
});

const aPostRequest = (body: unknown): CatalogueEvent =>
  aRequest({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(body),
  });

const shitpostRepositoryContract = (
  implementation: string,
  makeRepository: (seed: readonly Shitpost[]) => ShitpostRepository,
) => {
  describe(`ShitpostRepository contract — ${implementation}`, () => {
    test('findAll returns every stored shitpost', async () => {
      const seed = [
        aShitpost({ shitpostKey: 'media/one.png', uploadedAt: '2026-01-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/two.mp4', uploadedAt: '2026-02-02T00:00:00Z' }),
      ];

      const found = await makeRepository(seed).findAll();

      expect(found).toHaveLength(2);
      expect(found).toEqual(expect.arrayContaining(seed));
    });

    test('findAll returns an empty list from an empty catalogue', async () => {
      await expect(makeRepository([]).findAll()).resolves.toEqual([]);
    });

    test('save makes a shitpost retrievable by findAll', async () => {
      const repository = makeRepository([]);
      const fresh = aShitpost({ shitpostKey: 'media/brand-new.png' });

      await repository.save(fresh);

      await expect(repository.findAll()).resolves.toEqual([fresh]);
    });

    test('a shitpost keeps its tags from save to findAll', async () => {
      const repository = makeRepository([]);
      const tagged = aShitpost({
        shitpostKey: 'media/cat-in-a-terminal.png',
        tags: ['cats', 'programming'],
      });

      await repository.save(tagged);

      const [found] = await repository.findAll();
      expect(found?.tags).toEqual(['cats', 'programming']);
    });
  });
};

shitpostRepositoryContract('in-memory fake', inMemoryRepository);
shitpostRepositoryContract('DynamoDB adapter', dynamoDbBackedRepository);
shitpostRepositoryContract(
  'instrumented decorator',
  (seed) => withRepositoryTelemetry(inMemoryRepository(seed)).repository,
);

test('the instrumented repository measures time spent in the port and items returned', async () => {
  const { repository, drain } = withRepositoryTelemetry(
    inMemoryRepository([aShitpost(), aShitpost({ shitpostKey: 'media/two.png' })]),
    { now: tickingClock(40) },
  );

  await repository.findAll();
  await repository.save(aShitpost({ shitpostKey: 'media/three.png' }));

  expect(drain()).toEqual({ repositoryDurationMs: 80, itemCount: 2 });
});

test('a repository failure still records the time spent failing', async () => {
  const denied = new Error('AccessDeniedException');
  const failingRepository: ShitpostRepository = {
    findAll: async () => {
      throw denied;
    },
    save: async () => {
      throw denied;
    },
  };
  const { repository, drain } = withRepositoryTelemetry(failingRepository, {
    now: tickingClock(40),
  });

  await expect(repository.findAll()).rejects.toThrow(denied);
  await expect(repository.save(aShitpost())).rejects.toThrow(denied);

  expect(drain()).toEqual({ repositoryDurationMs: 80, itemCount: 0 });
});

test('draining the telemetry resets it for the next request', async () => {
  const { repository, drain } = withRepositoryTelemetry(inMemoryRepository([]), {
    now: tickingClock(40),
  });

  await repository.findAll();
  drain();

  expect(drain()).toEqual({ repositoryDurationMs: 0, itemCount: 0 });
});

test('the canonical event carries repository timing and item count', async () => {
  const { repository, drain } = withRepositoryTelemetry(
    inMemoryRepository([aShitpost()]),
    { now: tickingClock(30) },
  );
  const events: Record<string, unknown>[] = [];
  const handler = aCatalogueHandler(
    { shitposts: repository },
    { emit: (event) => events.push(event), collect: drain },
  );

  await handler(aRequest());

  expect(events).toEqual([
    expect.objectContaining({ repositoryDurationMs: 30, itemCount: 1 }),
  ]);
});

test('the EMF line still carries every wide-event field', () => {
  const line = JSON.parse(emfFormat(aCanonicalEvent(), { now: () => 1753500000000 }));

  expect(line).toEqual(
    expect.objectContaining({
      method: 'GET',
      path: '/shitposts',
      durationMs: 142,
      coldStart: false,
      requestId: 'req-123',
      repositoryDurationMs: 128,
      itemCount: 91,
    }),
  );
});

test('the EMF line declares durationMs as a metric dimensioned by method and status code', () => {
  const line = JSON.parse(emfFormat(aCanonicalEvent(), { now: () => 1753500000000 }));

  expect(line._aws).toEqual({
    Timestamp: 1753500000000,
    CloudWatchMetrics: [
      {
        Namespace: 'Signal/Catalogue',
        Dimensions: [['method', 'statusCode'], []],
        Metrics: [
          { Name: 'durationMs', Unit: 'Milliseconds' },
          { Name: 'errorCount', Unit: 'Count' },
        ],
      },
    ],
  });
  expect(line.statusCode).toBe('200');
});

test('a failed request counts one error; a healthy request counts zero', () => {
  const healthy = JSON.parse(emfFormat(aCanonicalEvent(), { now: () => 0 }));
  const failed = JSON.parse(
    emfFormat(aCanonicalEvent({ statusCode: 500, errorName: 'ConnectionTimeout' }), {
      now: () => 0,
    }),
  );

  expect(healthy.errorCount).toBe(0);
  expect(failed.errorCount).toBe(1);
  expect(failed.errorName).toBe('ConnectionTimeout');
});

test('the DynamoDB signal repository stores a signal under the user partition, ordered by time', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  const written: unknown[] = [];
  dynamoDb.on(PutCommand).callsFake((input) => {
    written.push(input.Item);
    return {};
  });

  const repository = dynamoDbSignalRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
  await repository.save({
    userId: 'ali',
    shitpostKey: 'media/cat.png',
    tags: ['cats'],
    signalledAt: '2025-07-26T03:20:00.000Z',
  });

  expect(written).toEqual([
    {
      PK: 'USER#ali',
      SK: 'SIGNAL#2025-07-26T03:20:00.000Z#media/cat.png',
      userId: 'ali',
      shitpostKey: 'media/cat.png',
      tags: ['cats'],
      signalledAt: '2025-07-26T03:20:00.000Z',
    },
  ]);
  dynamoDb.restore();
});

test('a row stored before tags existed surfaces as a shitpost with no tags', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb.on(QueryCommand).resolves({
    Items: [{ PK: 'SHITPOST', SK: 'media/vintage.png', uploadedAt: '2026-07-19T21:00:00Z' }],
  });

  const repository = dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });

  const [vintage] = await repository.findAll();

  expect(vintage?.tags).toEqual([]);
  dynamoDb.restore();
});

test('the DynamoDB repository rejects malformed rows at the database boundary', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb.on(QueryCommand).resolves({
    Items: [{ PK: 'SHITPOST', SK: 'media/fresh.mp4', uploadedAt: 'not-a-date' }],
  });

  const repository = dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });

  await expect(repository.findAll()).rejects.toThrow();
  dynamoDb.restore();
});

test('GET /shitposts responds 200 with the hoard as JSON, newest first', async () => {
  const newest = aShitpost({
    shitpostKey: 'media/fresh.mp4',
    uploadedAt: '2026-07-19T21:00:00Z',
  });
  const oldest = aShitpost({
    shitpostKey: 'media/ancient.png',
    uploadedAt: '2025-10-08T09:00:00Z',
  });
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository([oldest, newest]),
  });

  const response = await handler(aRequest());

  expect(response.statusCode).toBe(200);
  expect(response.headers?.['Content-Type']).toBe('application/json');
  expect(JSON.parse(response.body ?? '')).toEqual({
    shitposts: [newest, oldest],
  });
});

test('POST /shitposts stores a valid shitpost and responds 201', async () => {
  const repository = inMemoryRepository([]);
  const handler = aCatalogueHandler({ shitposts: repository });
  const fresh = aShitpost({ shitpostKey: 'media/just-posted.png' });

  const response = await handler(aPostRequest(fresh));

  expect(response.statusCode).toBe(201);
  expect(JSON.parse(response.body ?? '')).toEqual({ shitpost: fresh });
  await expect(repository.findAll()).resolves.toEqual([fresh]);
});

test('POST /shitposts rejects an invalid body with 400 and stores nothing', async () => {
  const repository = inMemoryRepository([]);
  const handler = aCatalogueHandler({ shitposts: repository });

  const response = await handler(
    aPostRequest({ shitpostKey: '', uploadedAt: 'not-a-date' }),
  );

  expect(response.statusCode).toBe(400);
  await expect(repository.findAll()).resolves.toEqual([]);
});

test('GET /feed ranks the hoard by tag affinity, then newest first', async () => {
  const catPost = aShitpost({
    shitpostKey: 'media/cat.png',
    uploadedAt: '2026-01-01T00:00:00Z',
    tags: ['cats'],
  });
  const memePost = aShitpost({
    shitpostKey: 'media/meme.png',
    uploadedAt: '2026-06-01T00:00:00Z',
    tags: ['memes'],
  });
  const vintagePost = aShitpost({
    shitpostKey: 'media/vintage.png',
    uploadedAt: '2026-03-01T00:00:00Z',
    tags: [],
  });
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository([memePost, vintagePost, catPost]),
    profiles: inMemoryTasteProfiles({ ali: { cats: 4, memes: 1 } }),
  });

  const response = await handler(
    aRequest({ rawPath: '/feed', queryStringParameters: { userId: 'ali' } }),
  );

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body ?? '')).toEqual({
    feed: [catPost, memePost, vintagePost],
  });
});

test('GET /feed for a user with no profile yet falls back to newest first', async () => {
  const newest = aShitpost({ shitpostKey: 'media/new.png', uploadedAt: '2026-06-01T00:00:00Z' });
  const oldest = aShitpost({ shitpostKey: 'media/old.png', uploadedAt: '2026-01-01T00:00:00Z' });
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository([oldest, newest]),
    profiles: inMemoryTasteProfiles({}),
  });

  const response = await handler(
    aRequest({ rawPath: '/feed', queryStringParameters: { userId: 'stranger' } }),
  );

  expect(JSON.parse(response.body ?? '')).toEqual({ feed: [newest, oldest] });
});

test('GET /feed without a userId is rejected with 400', async () => {
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository([]),
    profiles: inMemoryTasteProfiles({}),
  });

  const response = await handler(aRequest({ rawPath: '/feed' }));

  expect(response.statusCode).toBe(400);
});

test('the DynamoDB taste profile reader queries the profile prefix and maps tallies by tag', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb.on(QueryCommand).callsFake((input) => {
    expect(input).toEqual(
      expect.objectContaining({
        TableName: 'TestCatalogue',
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': 'USER#ali', ':prefix': 'PROFILE#TAG#' },
      }),
    );
    return {
      Items: [
        { PK: 'USER#ali', SK: 'PROFILE#TAG#cats', tally: 4 },
        { PK: 'USER#ali', SK: 'PROFILE#TAG#memes', tally: 1 },
      ],
    };
  });

  const profiles = dynamoDbTasteProfileReader({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });

  await expect(profiles.findByUser('ali')).resolves.toEqual({ cats: 4, memes: 1 });
  dynamoDb.restore();
});

const aSignalRequest = (body: unknown): CatalogueEvent =>
  aRequest({
    rawPath: '/signals',
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(body),
  });

test('POST /signals stores a signal carrying the shitpost tags at that moment', async () => {
  const signals = inMemorySignalRepository();
  const handler = aCatalogueHandler(
    {
      shitposts: inMemoryRepository([
        aShitpost({ shitpostKey: 'media/cat.png', tags: ['cats', 'programming'] }),
      ]),
      signals,
    },
    { now: () => 1753500000000 },
  );

  const response = await handler(
    aSignalRequest({ userId: 'ali', shitpostKey: 'media/cat.png' }),
  );

  expect(response.statusCode).toBe(201);
  await expect(signals.findAll()).resolves.toEqual([
    {
      userId: 'ali',
      shitpostKey: 'media/cat.png',
      tags: ['cats', 'programming'],
      signalledAt: '2025-07-26T03:20:00.000Z',
    },
  ]);
});

test('POST /signals responds 404 for an unknown shitpost and stores nothing', async () => {
  const signals = inMemorySignalRepository();
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository([]),
    signals,
  });

  const response = await handler(
    aSignalRequest({ userId: 'ali', shitpostKey: 'media/does-not-exist.png' }),
  );

  expect(response.statusCode).toBe(404);
  await expect(signals.findAll()).resolves.toEqual([]);
});

test('POST /signals rejects an invalid body with 400 and stores nothing', async () => {
  const signals = inMemorySignalRepository();
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository([]),
    signals,
  });

  const response = await handler(aSignalRequest({ userId: '', shitpostKey: '' }));

  expect(response.statusCode).toBe(400);
  await expect(signals.findAll()).resolves.toEqual([]);
});

test('POST /shitposts rejects a body that is not JSON with 400', async () => {
  const handler = aCatalogueHandler({ shitposts: inMemoryRepository([]) });

  const response = await handler(
    aRequest({
      requestContext: { http: { method: 'POST' } },
      body: 'not json at all',
    }),
  );

  expect(response.statusCode).toBe(400);
});

const tickingClock = (stepMs: number) => {
  let elapsed = 0;
  return () => (elapsed += stepMs);
};

test('every request emits exactly one canonical event carrying the request vitals', async () => {
  const events: Record<string, unknown>[] = [];
  const handler = aCatalogueHandler(
    { shitposts: inMemoryRepository([aShitpost()]) },
    { emit: (event) => events.push(event), now: tickingClock(125) },
  );

  await handler(
    aRequest({
      rawPath: '/shitposts',
      requestContext: { requestId: 'req-123', http: { method: 'GET' } },
    }),
  );

  expect(events).toEqual([
    expect.objectContaining({
      method: 'GET',
      path: '/shitposts',
      statusCode: 200,
      durationMs: 125,
      coldStart: true,
      requestId: 'req-123',
    }),
  ]);
});

test('only the first request on a container counts as a cold start', async () => {
  const events: Record<string, unknown>[] = [];
  const handler = aCatalogueHandler(
    { shitposts: inMemoryRepository([]) },
    { emit: (event) => events.push(event) },
  );

  await handler(aRequest());
  await handler(aRequest());

  expect(events.map((event) => event.coldStart)).toEqual([true, false]);
});

test('a repository failure still emits the canonical event, naming the error class', async () => {
  const failure = new Error('ConnectionTimeout: 10.0.4.2:8000');
  failure.name = 'ConnectionTimeout';
  const brokenRepository: ShitpostRepository = {
    findAll: async () => {
      throw failure;
    },
    save: async () => {
      throw failure;
    },
  };
  const events: Record<string, unknown>[] = [];
  const handler = aCatalogueHandler(
    { shitposts: brokenRepository },
    { emit: (event) => events.push(event) },
  );

  await handler(aRequest());

  expect(events).toEqual([
    expect.objectContaining({ statusCode: 500, errorName: 'ConnectionTimeout' }),
  ]);
});

test('GET /shitposts responds 500 without leaking internals when the catalogue is unreachable', async () => {
  const brokenRepository: ShitpostRepository = {
    findAll: async () => {
      throw new Error('ConnectionTimeout: 10.0.4.2:8000 credentials=AKIA...');
    },
    save: async () => {
      throw new Error('unreachable');
    },
  };
  const handler = aCatalogueHandler({ shitposts: brokenRepository });

  const response = await handler(aRequest());

  expect(response.statusCode).toBe(500);
  expect(response.body).not.toContain('ConnectionTimeout');
  expect(JSON.parse(response.body ?? '')).toEqual({
    error: 'catalogue unavailable',
  });
});
