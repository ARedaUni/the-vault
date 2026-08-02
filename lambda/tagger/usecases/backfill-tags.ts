import { createTagShitpost } from './tag-shitpost';
import type { TaggerPorts } from './tag-shitpost';

export type BackfillSummary = {
  tagged: number;
  skipped: number;
};

export const createBackfillTags = (options: TaggerPorts) => {
  const tagShitpost = createTagShitpost(options);

  return async (): Promise<BackfillSummary> => {
    const all = await options.shitposts.findAll();

    let tagged = 0;
    for (const shitpost of all) {
      if (await tagShitpost(shitpost)) {
        tagged += 1;
      }
    }

    return { tagged, skipped: all.length - tagged };
  };
};
