import type { Signal } from '../../shared/domain/signal';
import type { TasteProfileRepository } from '../domain/taste-profile-repository';

export type ProfileBuilderPorts = {
  profiles: TasteProfileRepository;
};

export const createRecordTaste =
  (ports: ProfileBuilderPorts) =>
  async (signal: Signal): Promise<void> => {
    for (const tag of signal.tags) {
      await ports.profiles.incrementTag({ userId: signal.userId, tag });
    }
  };
