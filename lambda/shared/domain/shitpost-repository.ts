import type { Shitpost } from './shitpost';

/**
 * `findAll` is the honest read: it includes deleted shitposts, because the
 * harvester needs the tombstone to know it must not re-harvest the post.
 * Everything user-facing wants `findLive` instead.
 */
export interface ShitpostRepository {
  findAll(): Promise<readonly Shitpost[]>;
  findLive(): Promise<readonly Shitpost[]>;
  save(shitpost: Shitpost): Promise<void>;
  markDeleted(shitpostKey: string, deletedAt: string): Promise<void>;
}
