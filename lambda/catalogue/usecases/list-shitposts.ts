import type { Shitpost } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';

export const listShitposts = async (
  repository: ShitpostRepository,
): Promise<readonly Shitpost[]> => {
  const hoard = await repository.findAll();
  return [...hoard].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
};
