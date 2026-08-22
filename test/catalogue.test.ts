import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../lambda/shared/adapters/dynamodb-shitpost-repository';
import { dynamoDbSignalRepository } from '../lambda/catalogue/adapters/dynamodb-signal-repository';
import { dynamoDbTasteProfileReader } from '../lambda/catalogue/adapters/dynamodb-taste-profile-reader';
import type { CatalogueEvent } from '../lambda/catalogue/triggers/http';
import type { Shitpost } from '../lambda/shared/domain/shitpost';
import type { ShitpostRepository } from '../lambda/shared/domain/shitpost-repository';
import { measuredShitpostRepository } from '../lambda/catalogue/telemetry/measured-shitpost-repository';
import { emfFormat } from '../lambda/catalogue/telemetry/emf';
import {
  aCanonicalEvent,
  aCatalogueHandler,
  aShitpost,
  alwaysFailingRepository,
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

    test('findAll still returns a deleted shitpost, so it is never re-harvested', async () => {
      const repository = makeRepository([aShitpost({ shitpostKey: 'media/regret.png' })]);

      await repository.markDeleted('media/regret.png', '2026-08-18T09:00:00Z');

      await expect(repository.findAll()).resolves.toEqual([
        expect.objectContaining({
          shitpostKey: 'media/regret.png',
          deletedAt: '2026-08-18T09:00:00Z',
        }),
      ]);
    });

    test('save keeps a shitpost deleted when only its tags change', async () => {
      const repository = makeRepository([aShitpost({ shitpostKey: 'media/regret.png' })]);
      await repository.markDeleted('media/regret.png', '2026-08-18T09:00:00Z');
      const [deleted] = await repository.findAll();

      await repository.save({ ...deleted!, tags: ['freshly', 'tagged'] });

      const page = await repository.findLivePage({ limit: 20 });
      expect(page.shitposts).toEqual([]);
    });

    test('getByKey returns the one shitpost addressed by its key', async () => {
      const repository = makeRepository([
        aShitpost({ shitpostKey: 'media/one.png' }),
        aShitpost({ shitpostKey: 'media/two.mp4', tags: ['wanted'] }),
      ]);

      await expect(repository.getByKey('media/two.mp4')).resolves.toEqual(
        expect.objectContaining({ shitpostKey: 'media/two.mp4', tags: ['wanted'] }),
      );
    });

    test('getByKey returns undefined for a key that was never stored', async () => {
      const repository = makeRepository([aShitpost({ shitpostKey: 'media/one.png' })]);

      await expect(repository.getByKey('media/never.png')).resolves.toBeUndefined();
    });

    test('getByKey still returns a deleted shitpost, so a signal on it is not resurrected as new', async () => {
      const repository = makeRepository([aShitpost({ shitpostKey: 'media/regret.png' })]);

      await repository.markDeleted('media/regret.png', '2026-08-18T09:00:00Z');

      await expect(repository.getByKey('media/regret.png')).resolves.toEqual(
        expect.objectContaining({ deletedAt: '2026-08-18T09:00:00Z' }),
      );
    });

    test('findLivePage returns a page no larger than the limit, newest first', async () => {
      const repository = makeRepository([
        aShitpost({ shitpostKey: 'media/oldest.png', uploadedAt: '2026-01-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/middle.png', uploadedAt: '2026-02-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/newest.png', uploadedAt: '2026-03-01T00:00:00Z' }),
      ]);

      const page = await repository.findLivePage({ limit: 2 });

      expect(page.shitposts.map((shitpost) => shitpost.shitpostKey)).toEqual([
        'media/newest.png',
        'media/middle.png',
      ]);
    });

    test('the cursor resumes at the shitpost the previous page stopped on', async () => {
      const repository = makeRepository([
        aShitpost({ shitpostKey: 'media/oldest.png', uploadedAt: '2026-01-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/middle.png', uploadedAt: '2026-02-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/newest.png', uploadedAt: '2026-03-01T00:00:00Z' }),
      ]);

      const first = await repository.findLivePage({ limit: 2 });
      const second = await repository.findLivePage({
        limit: 2,
        cursor: first.nextCursor,
      });

      expect(second.shitposts.map((shitpost) => shitpost.shitpostKey)).toEqual([
        'media/oldest.png',
      ]);
    });

    test('the last page offers no cursor, so the gallery knows to stop asking', async () => {
      const repository = makeRepository([
        aShitpost({ shitpostKey: 'media/one.png', uploadedAt: '2026-01-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/two.png', uploadedAt: '2026-02-01T00:00:00Z' }),
      ]);

      const only = await repository.findLivePage({ limit: 20 });

      expect(only.shitposts).toHaveLength(2);
      expect(only.nextCursor).toBeUndefined();
    });

    test('findLivePage omits a deleted shitpost, so a page of live memes stays full', async () => {
      const repository = makeRepository([
        aShitpost({ shitpostKey: 'media/keeper.png', uploadedAt: '2026-01-01T00:00:00Z' }),
        aShitpost({ shitpostKey: 'media/regret.png', uploadedAt: '2026-02-01T00:00:00Z' }),
      ]);

      await repository.markDeleted('media/regret.png', '2026-08-18T09:00:00Z');

      const page = await repository.findLivePage({ limit: 20 });
      expect(page.shitposts.map((shitpost) => shitpost.shitpostKey)).toEqual([
        'media/keeper.png',
      ]);
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
  'measured decorator',
  (seed) => measuredShitpostRepository(inMemoryRepository(seed)).shitposts,
);

test('the measured repository records time spent in the port and items returned', async () => {
  const { shitposts, drain } = measuredShitpostRepository(
    inMemoryRepository([aShitpost(), aShitpost({ shitpostKey: 'media/two.png' })]),
    { now: tickingClock(40) },
  );

  await shitposts.findAll();
  await shitposts.save(aShitpost({ shitpostKey: 'media/three.png' }));

  expect(drain()).toEqual({ repositoryDurationMs: 80, itemCount: 2 });
});

test('a repository failure still records the time spent failing', async () => {
  const denied = new Error('AccessDeniedException');
  const { shitposts, drain } = measuredShitpostRepository(alwaysFailingRepository(denied), {
    now: tickingClock(40),
  });

  await expect(shitposts.findAll()).rejects.toThrow(denied);
  await expect(shitposts.save(aShitpost())).rejects.toThrow(denied);

  expect(drain()).toEqual({ repositoryDurationMs: 80, itemCount: 0 });
});

test('draining the measurements resets them for the next request', async () => {
  const { shitposts, drain } = measuredShitpostRepository(inMemoryRepository([]), {
    now: tickingClock(40),
  });

  await shitposts.findAll();
  drain();

  expect(drain()).toEqual({ repositoryDurationMs: 0, itemCount: 0 });
});

test('the canonical event carries repository timing and item count', async () => {
  const { shitposts, drain } = measuredShitpostRepository(
    inMemoryRepository([aShitpost()]),
    { now: tickingClock(30) },
  );
  const events: Record<string, unknown>[] = [];
  const handler = aCatalogueHandler(
    { shitposts },
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

test('a saved shitpost carries the marker that lists it in the upload-time index', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  const written: Record<string, unknown>[] = [];
  dynamoDb.on(PutCommand).callsFake((input) => {
    written.push(input.Item);
    return {};
  });

  const repository = dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
  await repository.save(aShitpost({ shitpostKey: 'media/fresh.png' }));

  expect(written[0]).toEqual(expect.objectContaining({ liveMarker: 'LIVE' }));
  dynamoDb.restore();
});

test('a shitpost saved as deleted carries no marker, so the index never lists it', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  const written: Record<string, unknown>[] = [];
  dynamoDb.on(PutCommand).callsFake((input) => {
    written.push(input.Item);
    return {};
  });

  const repository = dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
  await repository.save(
    aShitpost({ shitpostKey: 'media/regret.png', deletedAt: '2026-08-18T09:00:00Z' }),
  );

  expect(written[0]).not.toHaveProperty('liveMarker');
  dynamoDb.restore();
});

test('deleting a shitpost strips its marker, dropping it out of the index', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  const updates: Record<string, unknown>[] = [];
  dynamoDb.on(UpdateCommand).callsFake((input) => {
    updates.push(input);
    return {};
  });

  const repository = dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
  await repository.markDeleted('media/regret.png', '2026-08-18T09:00:00Z');

  expect(updates[0]?.UpdateExpression).toBe(
    'SET deletedAt = :deletedAt REMOVE liveMarker',
  );
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

test('GET /shitposts does not serve a deleted shitpost', async () => {
  const repository = inMemoryRepository([
    aShitpost({ shitpostKey: 'media/keeper.png' }),
    aShitpost({ shitpostKey: 'media/regret.png' }),
  ]);
  await repository.markDeleted('media/regret.png', '2026-08-19T09:00:00Z');
  const handler = aCatalogueHandler({ shitposts: repository });

  const response = await handler(aRequest());

  expect(JSON.parse(response.body ?? '')).toEqual({
    shitposts: [expect.objectContaining({ shitpostKey: 'media/keeper.png' })],
  });
});

const manyShitposts = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    aShitpost({
      shitpostKey: `media/${index}.png`,
      uploadedAt: new Date(
        Date.UTC(2026, 0, 1) + index * 60_000,
      ).toISOString(),
    }),
  );

test('GET /shitposts serves a screenful by default, not the whole hoard', async () => {
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository(manyShitposts(50)),
  });

  const response = await handler(aRequest());

  const body = JSON.parse(response.body ?? '');
  expect(body.shitposts).toHaveLength(20);
  expect(body.nextCursor).toEqual(expect.any(String));
});

test('GET /shitposts honours an explicit limit', async () => {
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository(manyShitposts(50)),
  });

  const response = await handler(aRequest({ queryStringParameters: { limit: '5' } }));

  expect(JSON.parse(response.body ?? '').shitposts).toHaveLength(5);
});

test('the cursor from one page fetches the next, with nothing repeated', async () => {
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository(manyShitposts(30)),
  });

  const first = JSON.parse(
    (await handler(aRequest({ queryStringParameters: { limit: '20' } }))).body ?? '',
  );
  const second = JSON.parse(
    (
      await handler(
        aRequest({
          queryStringParameters: { limit: '20', cursor: first.nextCursor },
        }),
      )
    ).body ?? '',
  );

  expect(second.shitposts).toHaveLength(10);
  expect(second.nextCursor).toBeUndefined();
  const keys = [...first.shitposts, ...second.shitposts].map(
    (shitpost: { shitpostKey: string }) => shitpost.shitpostKey,
  );
  expect(new Set(keys).size).toBe(30);
});

test('a limit beyond the ceiling is clamped, so no caller can ask for the whole table', async () => {
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository(manyShitposts(200)),
  });

  const response = await handler(
    aRequest({ queryStringParameters: { limit: '5000' } }),
  );

  expect(JSON.parse(response.body ?? '').shitposts).toHaveLength(100);
});

test('a nonsense limit falls back to the default rather than failing the request', async () => {
  const handler = aCatalogueHandler({
    shitposts: inMemoryRepository(manyShitposts(50)),
  });

  const response = await handler(
    aRequest({ queryStringParameters: { limit: 'twenty' } }),
  );

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body ?? '').shitposts).toHaveLength(20);
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
  const brokenRepository = alwaysFailingRepository(failure);
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
  const handler = aCatalogueHandler({
    shitposts: alwaysFailingRepository(
      new Error('ConnectionTimeout: 10.0.4.2:8000 credentials=AKIA...'),
    ),
  });

  const response = await handler(aRequest());

  expect(response.statusCode).toBe(500);
  expect(response.body).not.toContain('ConnectionTimeout');
  expect(JSON.parse(response.body ?? '')).toEqual({
    error: 'catalogue unavailable',
  });
});
