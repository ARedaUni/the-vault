import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';

/**
 * Tombstones rather than deletes: the row must survive so the harvester never
 * re-harvests the post and old signals still resolve. A shitpost already
 * tombstoned is reported as unknown, and its original `deletedAt` is kept —
 * a second delete must not rewrite the history of the first.
 */
export const removeShitpost = async (options: {
  shitposts: ShitpostRepository;
  shitpostKey: string;
  deletedAt: string;
}): Promise<'removed' | 'unknown'> => {
  const shitpost = await options.shitposts.getByKey(options.shitpostKey);
  if (shitpost === undefined || shitpost.deletedAt !== undefined) {
    return 'unknown';
  }

  await options.shitposts.markDeleted(options.shitpostKey, options.deletedAt);
  return 'removed';
};
