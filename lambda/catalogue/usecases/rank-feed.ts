import type { Shitpost } from '../../shared/domain/shitpost';
import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';
import type { TasteProfile, TasteProfileReader } from '../domain/taste-profile';

const affinity = (shitpost: Shitpost, profile: TasteProfile): number =>
  shitpost.tags.reduce((score, tag) => score + (profile[tag] ?? 0), 0);

export const rankFeed = async (options: {
  shitposts: ShitpostRepository;
  profiles: TasteProfileReader;
  userId: string;
}): Promise<readonly Shitpost[]> => {
  const [shitposts, profile] = await Promise.all([
    options.shitposts.findAll(),
    options.profiles.findByUser(options.userId),
  ]);

  return [...shitposts].sort(
    (a, b) =>
      affinity(b, profile) - affinity(a, profile) ||
      b.uploadedAt.localeCompare(a.uploadedAt),
  );
};
