import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { signalSchema } from '../shared/domain/signal';
import type { Signal } from '../shared/domain/signal';
import type { TasteProfileRepository } from './domain/taste-profile-repository';

export type StreamRecord = {
  eventName?: string;
  dynamodb?: { NewImage?: Record<string, AttributeValue> };
};

const isSignalItem = (item: Record<string, unknown>): boolean =>
  typeof item.SK === 'string' && item.SK.startsWith('SIGNAL#');

const insertedSignals = (records: readonly StreamRecord[]): readonly Signal[] =>
  records
    .filter((record) => record.eventName === 'INSERT')
    .flatMap((record) => (record.dynamodb?.NewImage ? [record.dynamodb.NewImage] : []))
    .map((image) => unmarshall(image))
    .filter(isSignalItem)
    .map((item) => signalSchema.parse(item));

export const createProfileBuilder =
  (profiles: TasteProfileRepository) =>
  async (event: { Records: readonly StreamRecord[] }): Promise<void> => {
    const increments = insertedSignals(event.Records).flatMap((signal) =>
      signal.tags.map((tag) => ({ userId: signal.userId, tag })),
    );

    for (const increment of increments) {
      await profiles.incrementTag(increment);
    }
  };
