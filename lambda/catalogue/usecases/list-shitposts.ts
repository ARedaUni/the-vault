import type { Shitpost } from '../../shared/domain/shitpost';
import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';

export const listShitposts = async (
  repository: ShitpostRepository,
): Promise<readonly Shitpost[]> => {
  const hoard = await repository.findLive();
  return [...hoard].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
};
