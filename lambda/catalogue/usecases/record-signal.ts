import type { Signal, SignalRequest } from '../domain/signal';
import type { SignalRepository } from '../domain/signal-repository';
import type { ShitpostRepository } from '../domain/shitpost-repository';

export const recordSignal = async (options: {
  shitposts: ShitpostRepository;
  signals: SignalRepository;
  request: SignalRequest;
  signalledAt: string;
}): Promise<Signal | undefined> => {
  const shitposts = await options.shitposts.findAll();
  const shitpost = shitposts.find(
    (candidate) => candidate.shitpostKey === options.request.shitpostKey,
  );
  if (!shitpost) {
    return undefined;
  }

  const signal: Signal = {
    userId: options.request.userId,
    shitpostKey: shitpost.shitpostKey,
    tags: shitpost.tags,
    signalledAt: options.signalledAt,
  };
  await options.signals.save(signal);
  return signal;
};
