import type { Signal } from '../../shared/domain/signal';

export interface SignalRepository {
  save(signal: Signal): Promise<void>;
}
