import { z } from 'zod';

export const shitpostSchema = z.object({
  shitpostKey: z.string().min(1),
  uploadedAt: z.iso.datetime(),
  tags: z.array(z.string().min(1)).default([]),
});

export type Shitpost = z.infer<typeof shitpostSchema>;
