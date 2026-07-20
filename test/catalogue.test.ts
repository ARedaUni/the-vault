import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../lambda/catalogue/repositories/shitposts';
import { createShitpostsHandler } from '../lambda/catalogue/routes/shitposts';
import { listShitposts } from '../lambda/catalogue/usecases/list-shitposts';
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

test('lists the hoard newest first', async () => {
  const oldest = aShitpost({
    shitpostKey: 'media/ancient.png',
    uploadedAt: '2025-10-08T09:00:00Z',
  });
  const newest = aShitpost({
    shitpostKey: 'media/fresh.mp4',
    uploadedAt: '2026-07-19T21:00:00Z',
  });
  const middle = aShitpost({
    shitpostKey: 'media/middling.png',
    uploadedAt: '2026-01-15T14:30:00Z',
  });

  const hoard = await listShitposts(inMemoryRepository([oldest, newest, middle]));

  expect(hoard.map((s) => s.shitpostKey)).toEqual([
    'media/fresh.mp4',
    'media/middling.png',
    'media/ancient.png',
  ]);
});

test('the DynamoDB supplier translates catalogue rows into shitposts', async () => {
  const dynamoDb = mockClient(DynamoDBDocumentClient);
  dynamoDb.on(QueryCommand, { TableName: 'TestCatalogue' }).resolves({
    Items: [
      { PK: 'SHITPOST', SK: 'media/fresh.mp4', uploadedAt: '2026-07-19T21:00:00Z' },
      { PK: 'SHITPOST', SK: 'media/ancient.png', uploadedAt: '2025-10-08T09:00:00Z' },
    ],
  });

  const repository = dynamoDbShitpostRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: 'TestCatalogue',
  });

  await expect(repository.findAll()).resolves.toEqual([
    { shitpostKey: 'media/fresh.mp4', uploadedAt: '2026-07-19T21:00:00Z' },
    { shitpostKey: 'media/ancient.png', uploadedAt: '2025-10-08T09:00:00Z' },
  ]);
  dynamoDb.restore();
});

test('the DynamoDB supplier refuses to smuggle malformed rows into the domain', async () => {
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

test('GET /shitposts serves the hoard as JSON, newest first', async () => {
  const newest = aShitpost({
    shitpostKey: 'media/fresh.mp4',
    uploadedAt: '2026-07-19T21:00:00Z',
  });
  const oldest = aShitpost({
    shitpostKey: 'media/ancient.png',
    uploadedAt: '2025-10-08T09:00:00Z',
  });
  const handler = createShitpostsHandler(inMemoryRepository([oldest, newest]));

  const response = await handler();

  expect(response.statusCode).toBe(200);
  expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(JSON.parse(response.body ?? '')).toEqual({
    shitposts: [newest, oldest],
  });
});
