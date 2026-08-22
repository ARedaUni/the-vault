import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';

export type RepositoryMeasurements = {
  repositoryDurationMs: number;
  itemCount: number;
};

export type MeasuredShitpostRepository = {
  shitposts: ShitpostRepository;
  drain: () => RepositoryMeasurements;
};

export const measuredShitpostRepository = (
  inner: ShitpostRepository,
  options: { now?: () => number } = {},
): MeasuredShitpostRepository => {
  const now = options.now ?? Date.now;
  let repositoryDurationMs = 0;
  let itemCount = 0;

  const record = (measurement: { durationMs?: number; itemCount?: number }) => {
    repositoryDurationMs += measurement.durationMs ?? 0;
    itemCount += measurement.itemCount ?? 0;
  };

  return {
    shitposts: {
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
      findLivePage: async (pageOptions) => {
        const startedAt = now();
        try {
          const page = await inner.findLivePage(pageOptions);
          record({ itemCount: page.shitposts.length });
          return page;
        } finally {
          record({ durationMs: now() - startedAt });
        }
      },
      getByKey: async (shitpostKey) => {
        const startedAt = now();
        try {
          const found = await inner.getByKey(shitpostKey);
          record({ itemCount: found === undefined ? 0 : 1 });
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
      markDeleted: async (shitpostKey, deletedAt) => {
        const startedAt = now();
        try {
          await inner.markDeleted(shitpostKey, deletedAt);
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
