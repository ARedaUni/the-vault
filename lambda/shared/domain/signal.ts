import { z } from 'zod';

export const signalRequestSchema = z.object({
  userId: z.string().min(1),
  shitpostKey: z.string().min(1),
});

export const signalSchema = signalRequestSchema.extend({
  tags: z.array(z.string().min(1)),
  signalledAt: z.iso.datetime(),
});

export type SignalRequest = z.infer<typeof signalRequestSchema>;
export type Signal = z.infer<typeof signalSchema>;
