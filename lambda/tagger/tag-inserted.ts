import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { shitpostSchema } from '../catalogue/domain/shitpost';
import type { Shitpost } from '../catalogue/domain/shitpost';
import { createTagShitpost } from './usecases/tag-shitpost';
import type { TaggerPorts } from './usecases/tag-shitpost';

export type StreamRecord = {
  eventName?: string;
  dynamodb?: { NewImage?: Record<string, AttributeValue> };
};

const isShitpostItem = (item: Record<string, unknown>): boolean =>
  item.PK === 'SHITPOST';

const insertedShitposts = (
  records: readonly StreamRecord[],
): readonly Shitpost[] =>
  records
    .filter((record) => record.eventName === 'INSERT')
    .flatMap((record) =>
      record.dynamodb?.NewImage ? [record.dynamodb.NewImage] : [],
    )
    .map((image) => unmarshall(image))
    .filter(isShitpostItem)
    .map((item) =>
      shitpostSchema.parse({
        shitpostKey: item.SK,
        uploadedAt: item.uploadedAt,
        tags: item.tags,
      }),
    );

export const createStreamTagger = (options: TaggerPorts) => {
  const tagShitpost = createTagShitpost(options);

  return async (event: { Records: readonly StreamRecord[] }): Promise<void> => {
    for (const shitpost of insertedShitposts(event.Records)) {
      await tagShitpost(shitpost);
    }
  };
};
