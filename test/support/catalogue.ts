import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { dynamoDbShitpostRepository } from '../../lambda/catalogue/repositories/shitposts';
import type { Shitpost } from '../../lambda/catalogue/domain/shitpost';
import type { ShitpostRepository } from '../../lambda/catalogue/domain/shitpost-repository';

export const aShitpost = (overrides: Partial<Shitpost> = {}): Shitpost => ({
  shitpostKey: 'media/default.png',
  uploadedAt: '2026-07-01T12:00:00Z',
  ...overrides,
});

export const inMemoryRepository = (
  seed: readonly Shitpost[] = [],
): ShitpostRepository => {
  let stored: readonly Shitpost[] = [...seed];
  return {
    findAll: async () => stored,
    save: async (shitpost) => {
      stored = [...stored, shitpost];
    },
  };
};

const toRow = (shitpost: Shitpost) => ({
  PK: 'SHITPOST',
  SK: shitpost.shitpostKey,
  uploadedAt: shitpost.uploadedAt,
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
