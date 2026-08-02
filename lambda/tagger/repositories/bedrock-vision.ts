import { z } from 'zod';
import type { ImageMediaType } from '../domain/media-store';
import type { VisionTagger } from '../domain/vision-tagger';

type VisionRequest = {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user';
    content: Array<
      | {
          type: 'image';
          source: { type: 'base64'; media_type: ImageMediaType; data: string };
        }
      | { type: 'text'; text: string }
    >;
  }>;
};

type VisionReply = {
  content: Array<{ type: string; text?: string }>;
};

export type VisionModelClient = {
  messages: {
    create: (params: VisionRequest) => Promise<VisionReply>;
  };
};

const TAGGING_INSTRUCTION =
  'Tag this meme for a personal recommendation feed. Reply with ONLY a JSON array of 3 to 5 short lowercase tags covering the subject, the format, and the joke (e.g. ["spongebob","programming","reaction-image"]). No other text.';

const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1),
  )
  .min(1)
  .max(5);

export const bedrockVisionTagger = (options: {
  client: VisionModelClient;
  model: string;
}): VisionTagger => ({
  suggestTags: async (image) => {
    const reply = await options.client.messages.create({
      model: options.model,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: Buffer.from(image.bytes).toString('base64'),
              },
            },
            { type: 'text', text: TAGGING_INSTRUCTION },
          ],
        },
      ],
    });

    const text = reply.content.find((block) => block.type === 'text')?.text;
    if (text === undefined) {
      throw new Error('vision model returned no text block');
    }

    return tagsSchema.parse(JSON.parse(text));
  },
});
