import type { Shitpost } from './shitpost';

export interface ShitpostRepository {
  findAll(): Promise<readonly Shitpost[]>;
}
