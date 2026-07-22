import type { Shitpost } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';

export const addShitpost = async (
  repository: ShitpostRepository,
  shitpost: Shitpost,
): Promise<Shitpost> => {
  await repository.save(shitpost);
  return shitpost;
};
