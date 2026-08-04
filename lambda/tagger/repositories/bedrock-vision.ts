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

const TAGGING_INSTRUCTION = [
  "You are tagging a shitpost for someone's personal \"which meme do I send right now\" library.",
  'The tags are how they find this image to fire back in a group chat, so they must capture how the meme is USED — not a literal inventory of what is in the frame.',
  "Do NOT tag incidental subjects, settings, or objects that aren't the actual joke. Never tag things like \"cat\", \"military\", \"cyberpunk\", or \"politics\" just because they appear on screen.",
  'Prioritise, in this order:',
  '1. the reaction or emotion it throws (e.g. disgust, smug, defeated, unbothered, crying-laughing, deadpan, menacing, cope, seething),',
  '2. the moment you would send it (e.g. when-someone-is-wrong, self-own, touch-grass, said-nothing-wrong, mid-argument),',
  '3. the humour register or internet subculture (e.g. brainrot, absurdist, ironic, sincerely-unserious, deep-fried, doomer, wholesome, gen-z, rage-bait),',
  '4. the meme format or named template ONLY if it is genuinely recognisable (e.g. wojak, chad, spongebob, soyjak).',
  'Reply with ONLY a JSON array of 3 to 5 short lowercase kebab-case tags. No other text.',
].join(' ');

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

    const unfenced = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
    return tagsSchema.parse(JSON.parse(unfenced));
  },
});
