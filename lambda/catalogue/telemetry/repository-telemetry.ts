import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';

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

  const record = (measurement: { durationMs?: number; itemCount?: number }) => {
    repositoryDurationMs += measurement.durationMs ?? 0;
    itemCount += measurement.itemCount ?? 0;
  };

  return {
    repository: {
      findAll: async () => {
        const startedAt = now();
        try {
          const found = await inner.findAll();
          record({ itemCount: found.length });
          return found;
        } finally {
          record({ durationMs: now() - startedAt });
        }
      },
      save: async (shitpost) => {
        const startedAt = now();
        try {
          await inner.save(shitpost);
        } finally {
          record({ durationMs: now() - startedAt });
        }
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
