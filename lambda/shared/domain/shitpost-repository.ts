import type { Shitpost } from './shitpost';

/**
 * `findAll` is the honest read: it includes deleted shitposts, because the
 * harvester needs the tombstone to know it must not re-harvest the post.
 * Everything user-facing wants `findLive` instead.
 */
export interface ShitpostRepository {
  findAll(): Promise<readonly Shitpost[]>;
  findLive(): Promise<readonly Shitpost[]>;
  /**
   * Tombstone-inclusive like `findAll`: a signal on a deleted shitpost must
   * still resolve, or deleting a meme would make old signals look bogus.
   */
  getByKey(shitpostKey: string): Promise<Shitpost | undefined>;
  save(shitpost: Shitpost): Promise<void>;
  markDeleted(shitpostKey: string, deletedAt: string): Promise<void>;
}
