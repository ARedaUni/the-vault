import { createHarvestSavedPosts } from '../usecases/harvest-saved-posts';
import type {
  HarvesterPorts,
  HarvestSummary,
} from '../usecases/harvest-saved-posts';

export type HarvesterOptions = {
  report?: (summary: HarvestSummary) => void;
};

export const createScheduledHarvest = (
  ports: HarvesterPorts,
  options: HarvesterOptions = {},
) => {
  const harvest = createHarvestSavedPosts(ports);
  const report = options.report ?? (() => {});

  return async (): Promise<HarvestSummary> => {
    const summary = await harvest();
    report(summary);
    return summary;
  };
};
