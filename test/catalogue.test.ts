import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../lambda/catalogue/repositories/shitposts';
import { createShitpostsHandler } from '../lambda/catalogue/routes/shitposts';
import type { CatalogueEvent } from '../lambda/catalogue/routes/shitposts';
import type { Shitpost } from '../lambda/catalogue/domain/shitpost';
import type { ShitpostRepository } from '../lambda/catalogue/domain/shitpost-repository';
import {
  aShitpost,
  dynamoDbBackedRepository,
  inMemoryRepository,
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
  });
};

shitpostRepositoryContract('in-memory fake', inMemoryRepository);
shitpostRepositoryContract('DynamoDB adapter', dynamoDbBackedRepository);

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
  const handler = createShitpostsHandler(inMemoryRepository([oldest, newest]));

  const response = await handler(aRequest());

  expect(response.statusCode).toBe(200);
  expect(response.headers?.['Content-Type']).toBe('application/json');
  expect(JSON.parse(response.body ?? '')).toEqual({
    shitposts: [newest, oldest],
  });
});

test('POST /shitposts stores a valid shitpost and responds 201', async () => {
  const repository = inMemoryRepository([]);
  const handler = createShitpostsHandler(repository);
  const fresh = aShitpost({ shitpostKey: 'media/just-posted.png' });

  const response = await handler(aPostRequest(fresh));

  expect(response.statusCode).toBe(201);
  expect(JSON.parse(response.body ?? '')).toEqual({ shitpost: fresh });
  await expect(repository.findAll()).resolves.toEqual([fresh]);
});

test('POST /shitposts rejects an invalid body with 400 and stores nothing', async () => {
  const repository = inMemoryRepository([]);
  const handler = createShitpostsHandler(repository);

  const response = await handler(
    aPostRequest({ shitpostKey: '', uploadedAt: 'not-a-date' }),
  );

  expect(response.statusCode).toBe(400);
  await expect(repository.findAll()).resolves.toEqual([]);
});

test('POST /shitposts rejects a body that is not JSON with 400', async () => {
  const handler = createShitpostsHandler(inMemoryRepository([]));

  const response = await handler(
    aRequest({
      requestContext: { http: { method: 'POST' } },
      body: 'not json at all',
    }),
  );

  expect(response.statusCode).toBe(400);
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
  const handler = createShitpostsHandler(brokenRepository);

  const response = await handler(aRequest());

  expect(response.statusCode).toBe(500);
  expect(response.body).not.toContain('ConnectionTimeout');
  expect(JSON.parse(response.body ?? '')).toEqual({
    error: 'catalogue unavailable',
  });
});
