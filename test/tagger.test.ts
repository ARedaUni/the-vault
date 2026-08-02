import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { aShitpost, inMemoryRepository } from './support/catalogue';
import { createBackfillTags } from '../lambda/tagger/usecases/backfill-tags';
import {
  bedrockVisionTagger,
  type VisionModelClient,
} from '../lambda/tagger/repositories/bedrock-vision';
import { s3MediaStore } from '../lambda/tagger/repositories/s3-media';
import type { MediaStore, StoredImage } from '../lambda/tagger/domain/media-store';
import type { VisionTagger } from '../lambda/tagger/domain/vision-tagger';

const anImage = (overrides: Partial<StoredImage> = {}): StoredImage => ({
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: 'image/png',
  ...overrides,
});

const inMemoryMediaStore = (
  images: Record<string, StoredImage> = {},
): MediaStore => ({
  fetch: async (key) => images[key] ?? anImage(),
});

const cannedVision = (tags: string[]): VisionTagger => ({
  suggestTags: async () => tags,
});

describe('bedrock vision tagger', () => {
  const aModelReply = (text: string) => ({
    content: [{ type: 'text' as const, text }],
  });

  const capturingClient = (replyText: string) => {
    const calls: unknown[] = [];
    const client: VisionModelClient = {
      messages: {
        create: async (params) => {
          calls.push(params);
          return aModelReply(replyText);
        },
      },
    };
    return { client, calls };
  };

  it('sends the image as base64 with a tagging instruction to the model', async () => {
    const { client, calls } = capturingClient('["cats","funny"]');
    const tagger = bedrockVisionTagger({
      client,
      model: 'anthropic.claude-haiku-4-5',
    });

    await tagger.suggestTags({
      bytes: new Uint8Array([104, 105]),
      mediaType: 'image/png',
    });

    expect(calls).toEqual([
      {
        model: 'anthropic.claude-haiku-4-5',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: Buffer.from([104, 105]).toString('base64'),
                },
              },
              { type: 'text', text: expect.stringContaining('JSON array') },
            ],
          },
        ],
      },
    ]);
  });

  it('parses the model reply into lowercase trimmed tags', async () => {
    const { client } = capturingClient('[" Cats", "FUNNY ", "spongebob"]');
    const tagger = bedrockVisionTagger({
      client,
      model: 'anthropic.claude-haiku-4-5',
    });

    const tags = await tagger.suggestTags({
      bytes: new Uint8Array([1]),
      mediaType: 'image/jpeg',
    });

    expect(tags).toEqual(['cats', 'funny', 'spongebob']);
  });

  it('rejects a reply that is not a JSON array of tags', async () => {
    const { client } = capturingClient('Sure! Here are some tags: cats, funny');
    const tagger = bedrockVisionTagger({
      client,
      model: 'anthropic.claude-haiku-4-5',
    });

    await expect(
      tagger.suggestTags({ bytes: new Uint8Array([1]), mediaType: 'image/png' }),
    ).rejects.toThrow();
  });
});

describe('s3 media store', () => {
  it('fetches the object bytes and media type from the media bucket', async () => {
    const s3 = mockClient(S3Client);
    s3.on(GetObjectCommand, {
      Bucket: 'test-media-bucket',
      Key: 'media/cat.png',
    }).resolves({
      ContentType: 'image/png',
      Body: {
        transformToByteArray: async () => new Uint8Array([9, 8, 7]),
      } as never,
    });
    const store = s3MediaStore({
      client: new S3Client({}),
      bucketName: 'test-media-bucket',
    });

    const image = await store.fetch('media/cat.png');

    expect(image).toEqual({
      bytes: new Uint8Array([9, 8, 7]),
      mediaType: 'image/png',
    });
  });
});

describe('backfill tags', () => {
  it('writes vision-suggested tags onto every untagged shitpost', async () => {
    const shitposts = inMemoryRepository([
      aShitpost({ shitpostKey: 'media/cat.png', tags: [] }),
      aShitpost({ shitpostKey: 'media/dog.png', tags: [] }),
    ]);
    const backfill = createBackfillTags({
      shitposts,
      media: inMemoryMediaStore(),
      vision: cannedVision(['cats', 'funny']),
    });

    await backfill();

    const stored = await shitposts.findAll();
    expect(stored).toHaveLength(2);
    expect(stored.every((s) => s.tags.length > 0)).toBe(true);
    expect(stored.find((s) => s.shitpostKey === 'media/cat.png')?.tags).toEqual([
      'cats',
      'funny',
    ]);
  });

  it('leaves already-tagged shitposts alone and never sends their images to vision', async () => {
    const seen: StoredImage[] = [];
    const spyingVision: VisionTagger = {
      suggestTags: async (image) => {
        seen.push(image);
        return ['fresh'];
      },
    };
    const shitposts = inMemoryRepository([
      aShitpost({ shitpostKey: 'media/tagged.png', tags: ['spongebob'] }),
      aShitpost({ shitpostKey: 'media/untagged.png', tags: [] }),
    ]);
    const backfill = createBackfillTags({
      shitposts,
      media: inMemoryMediaStore({
        'media/untagged.png': anImage({ bytes: new Uint8Array([9]) }),
      }),
      vision: spyingVision,
    });

    await backfill();

    expect(seen).toEqual([
      { bytes: new Uint8Array([9]), mediaType: 'image/png' },
    ]);
    const stored = await shitposts.findAll();
    expect(
      stored.find((s) => s.shitpostKey === 'media/tagged.png')?.tags,
    ).toEqual(['spongebob']);
  });

  it('reports how many were tagged and how many were skipped', async () => {
    const shitposts = inMemoryRepository([
      aShitpost({ shitpostKey: 'media/a.png', tags: ['memes'] }),
      aShitpost({ shitpostKey: 'media/b.png', tags: [] }),
      aShitpost({ shitpostKey: 'media/c.png', tags: [] }),
    ]);
    const backfill = createBackfillTags({
      shitposts,
      media: inMemoryMediaStore(),
      vision: cannedVision(['fresh']),
    });

    const summary = await backfill();

    expect(summary).toEqual({ tagged: 2, skipped: 1 });
  });
});
