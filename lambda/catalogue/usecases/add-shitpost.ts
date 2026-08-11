import type { Shitpost } from '../../shared/domain/shitpost';
import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';

export const addShitpost = async (
  repository: ShitpostRepository,
  shitpost: Shitpost,
): Promise<Shitpost> => {
  await repository.save(shitpost);
  return shitpost;
};
