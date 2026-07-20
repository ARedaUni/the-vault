import { z } from 'zod';

export const shitpostSchema = z.object({
  shitpostKey: z.string().min(1),
  uploadedAt: z.iso.datetime(),
});

export type Shitpost = z.infer<typeof shitpostSchema>;
