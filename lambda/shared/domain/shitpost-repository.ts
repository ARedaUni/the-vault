import type { Shitpost } from './shitpost';

/**
 * `findAll` is the honest read: it includes deleted shitposts, because the
 * harvester needs the tombstone to know it must not re-harvest the post.
 * Everything user-facing wants `findLivePage` instead.
 */
/**
 * `nextCursor` is opaque on purpose: callers hand it back untouched and never
 * parse it, which leaves each adapter free to page however its store pages.
 * Its absence is the only signal that the archive has been exhausted.
 */
export type ShitpostPage = {
  shitposts: readonly Shitpost[];
  nextCursor?: string;
};

export interface ShitpostRepository {
  findAll(): Promise<readonly Shitpost[]>;
  findLivePage(options: {
    limit: number;
    cursor?: string;
  }): Promise<ShitpostPage>;
  /**
   * Tombstone-inclusive like `findAll`: a signal on a deleted shitpost must
   * still resolve, or deleting a meme would make old signals look bogus.
   */
  getByKey(shitpostKey: string): Promise<Shitpost | undefined>;
  save(shitpost: Shitpost): Promise<void>;
  markDeleted(shitpostKey: string, deletedAt: string): Promise<void>;
}
