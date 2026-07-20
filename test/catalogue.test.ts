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

test('the DynamoDB repository translates catalogue rows into shitposts', async () => {
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
