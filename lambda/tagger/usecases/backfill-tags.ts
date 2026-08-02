import { createTagShitpost } from './tag-shitpost';
import type { TaggerPorts } from './tag-shitpost';

export type BackfillSummary = {
  tagged: number;
  skipped: number;
  failed: number;
};

export const createBackfillTags = (options: TaggerPorts) => {
  const tagShitpost = createTagShitpost(options);

  return async (): Promise<BackfillSummary> => {
    const all = await options.shitposts.findAll();

    let tagged = 0;
    let failed = 0;
    for (const shitpost of all) {
      try {
        if (await tagShitpost(shitpost)) {
          tagged += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(
          JSON.stringify({ failedKey: shitpost.shitpostKey, error: String(error) }),
        );
      }
    }

    return { tagged, skipped: all.length - tagged - failed, failed };
  };
};
