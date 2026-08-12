import { createBackfillTags } from '../usecases/backfill-tags';
import type { BackfillSummary } from '../usecases/backfill-tags';
import type { TaggerPorts } from '../usecases/tag-shitpost';
import { createStreamTagger } from './stream';
import type { StreamRecord } from './stream';

export type TaggerEvent = { Records?: readonly StreamRecord[] };

export type TaggerOptions = {
  report?: (summary: BackfillSummary) => void;
};

export const createTagger = (ports: TaggerPorts, options: TaggerOptions = {}) => {
  const tagInserted = createStreamTagger(ports);
  const backfillTags = createBackfillTags(ports);
  const report = options.report ?? (() => {});

  return async (event?: TaggerEvent): Promise<BackfillSummary | void> => {
    if (event?.Records !== undefined) {
      return tagInserted({ Records: event.Records });
    }

    const summary = await backfillTags();
    report(summary);
    return summary;
  };
};
