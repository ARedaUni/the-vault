import type { Signal } from './signal';

export type SignalRepository = {
  save: (signal: Signal) => Promise<void>;
};
