import type { ShitpostRepository } from '../domain/shitpost-repository';

export type RepositoryMeasurements = {
  repositoryDurationMs: number;
  itemCount: number;
};

export type InstrumentedRepository = {
  repository: ShitpostRepository;
  drain: () => RepositoryMeasurements;
};

export const withRepositoryTelemetry = (
  inner: ShitpostRepository,
  options: { now?: () => number } = {},
): InstrumentedRepository => {
  const now = options.now ?? Date.now;
  let repositoryDurationMs = 0;
  let itemCount = 0;

  const record = (measurement: { durationMs: number; itemCount?: number }) => {
    repositoryDurationMs += measurement.durationMs;
    itemCount += measurement.itemCount ?? 0;
  };

  return {
    repository: {
      findAll: async () => {
        const startedAt = now();
        const found = await inner.findAll();
        record({ durationMs: now() - startedAt, itemCount: found.length });
        return found;
      },
      save: async (shitpost) => {
        const startedAt = now();
        await inner.save(shitpost);
        record({ durationMs: now() - startedAt });
      },
    },
    drain: () => {
      const measurements = { repositoryDurationMs, itemCount };
      repositoryDurationMs = 0;
      itemCount = 0;
      return measurements;
    },
  };
};
