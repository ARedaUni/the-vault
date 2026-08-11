import type { Signal } from '../../shared/domain/signal';

export type SignalRepository = {
  save: (signal: Signal) => Promise<void>;
};
