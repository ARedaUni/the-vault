import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { signalSchema } from '../../shared/domain/signal';
import type { Signal } from '../../shared/domain/signal';
import { createRecordTaste } from '../usecases/record-taste';
import type { ProfileBuilderPorts } from '../usecases/record-taste';

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

export const createProfileBuilder = (ports: ProfileBuilderPorts) => {
  const recordTaste = createRecordTaste(ports);

  return async (event: { Records: readonly StreamRecord[] }): Promise<void> => {
    for (const signal of insertedSignals(event.Records)) {
      await recordTaste(signal);
    }
  };
};
