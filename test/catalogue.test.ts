import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../lambda/catalogue/repositories/shitposts';
import { createShitpostsHandler } from '../lambda/catalogue/routes/shitposts';
import type { Shitpost } from '../lambda/catalogue/domain/shitpost';
import type { ShitpostRepository } from '../lambda/catalogue/domain/shitpost-repository';

const aShitpost = (overrides: Partial<Shitpost> = {}): Shitpost => ({
  shitpostKey: 'media/default.png',
  uploadedAt: '2026-07-01T12:00:00Z',
  ...overrides,
});

const inMemoryRepository = (
  shitposts: readonly Shitpost[],
): ShitpostRepository => ({
  findAll: async () => shitposts,
});

const dynamoDbBackedRepository = (
  shitposts: readonly Shitpost[],
): ShitpostRepository => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb.on(QueryCommand, { TableName: 'TestCatalogue' }).resolves({
    Items: shitposts.map((shitpost) => ({
      PK: 'SHITPOST',
      SK: shitpost.shitpostKey,
      uploadedAt: shitpost.uploadedAt,
    })),
  });
  return dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });
};

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
  const middle = aShitpost({
    shitpostKey: 'media/middling.png',
    uploadedAt: '2026-01-15T14:30:00Z',
  });
  const oldest = aShitpost({
    shitpostKey: 'media/ancient.png',
    uploadedAt: '2025-10-08T09:00:00Z',
  });
  const handler = createShitpostsHandler(
    inMemoryRepository([oldest, newest, middle]),
  );

  const response = await handler();

  expect(response.statusCode).toBe(200);
  expect(response.headers?.['Content-Type']).toBe('application/json');
  expect(JSON.parse(response.body ?? '')).toEqual({
    shitposts: [newest, middle, oldest],
  });
});

test('GET /shitposts responds 500 without leaking internals when the catalogue is unreachable', async () => {
  const brokenRepository: ShitpostRepository = {
    findAll: async () => {
      throw new Error('ConnectionTimeout: 10.0.4.2:8000 credentials=AKIA...');
    },
  };
  const handler = createShitpostsHandler(brokenRepository);

  const response = await handler();

  expect(response.statusCode).toBe(500);
  expect(response.headers?.['Content-Type']).toBe('application/json');
  expect(response.body).not.toContain('ConnectionTimeout');
  expect(JSON.parse(response.body ?? '')).toEqual({
    error: 'catalogue unavailable',
  });
});
