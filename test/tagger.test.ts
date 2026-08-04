import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { aShitpost, inMemoryRepository } from './support/catalogue';
import {
  createStreamTagger,
  type StreamRecord,
} from '../lambda/tagger/tag-inserted';
import { createBackfillTags } from '../lambda/tagger/usecases/backfill-tags';
import {
  bedrockVisionTagger,
  type VisionModelClient,
} from '../lambda/tagger/adapters/bedrock-vision';
import { s3MediaStore } from '../lambda/tagger/adapters/s3-media';
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

  it('tolerates the array arriving wrapped in a markdown code fence', async () => {
    const { client } = capturingClient('```json\n["cats","funny"]\n```');
    const tagger = bedrockVisionTagger({
      client,
      model: 'anthropic.claude-haiku-4-5',
    });

    const tags = await tagger.suggestTags({
      bytes: new Uint8Array([1]),
      mediaType: 'image/png',
    });

    expect(tags).toEqual(['cats', 'funny']);
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

describe('stream tagger', () => {
  const aShitpostInsert = (
    overrides: Partial<{ SK: string; tags: string[] }> = {},
  ): StreamRecord => ({
    eventName: 'INSERT',
    dynamodb: {
      NewImage: marshall({
        PK: 'SHITPOST',
        SK: 'media/new.png',
        uploadedAt: '2026-08-01T12:00:00Z',
        ...overrides,
      }),
    },
  });

  const spyingVision = () => {
    const seen: StoredImage[] = [];
    const vision: VisionTagger = {
      suggestTags: async (image) => {
        seen.push(image);
        return ['fresh', 'stream'];
      },
    };
    return { vision, seen };
  };

  it('tags a freshly inserted shitpost', async () => {
    const shitposts = inMemoryRepository();
    const { vision } = spyingVision();
    const tagInserted = createStreamTagger({
      shitposts,
      media: inMemoryMediaStore(),
      vision,
    });

    await tagInserted({ Records: [aShitpostInsert({ SK: 'media/new.png' })] });

    const stored = await shitposts.findAll();
    expect(stored).toEqual([
      {
        shitpostKey: 'media/new.png',
        uploadedAt: '2026-08-01T12:00:00Z',
        tags: ['fresh', 'stream'],
      },
    ]);
  });

  it('ignores signal inserts and modify events', async () => {
    const shitposts = inMemoryRepository();
    const { vision, seen } = spyingVision();
    const tagInserted = createStreamTagger({
      shitposts,
      media: inMemoryMediaStore(),
      vision,
    });

    await tagInserted({
      Records: [
        {
          eventName: 'INSERT',
          dynamodb: {
            NewImage: marshall({
              PK: 'USER#ali',
              SK: 'SIGNAL#2026-08-01T12:00:00Z#media/cat.png',
              userId: 'ali',
              shitpostKey: 'media/cat.png',
              tags: ['cats'],
              signalledAt: '2026-08-01T12:00:00Z',
            }),
          },
        },
        { ...aShitpostInsert(), eventName: 'MODIFY' },
      ],
    });

    expect(seen).toEqual([]);
    expect(await shitposts.findAll()).toEqual([]);
  });

  it('leaves a shitpost that arrives already tagged alone', async () => {
    const shitposts = inMemoryRepository();
    const { vision, seen } = spyingVision();
    const tagInserted = createStreamTagger({
      shitposts,
      media: inMemoryMediaStore(),
      vision,
    });

    await tagInserted({
      Records: [aShitpostInsert({ tags: ['born-tagged'] })],
    });

    expect(seen).toEqual([]);
    expect(await shitposts.findAll()).toEqual([]);
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

    expect(summary).toEqual({ tagged: 2, skipped: 1, failed: 0 });
  });

  it('carries on past a failing image and reports it instead of dying', async () => {
    const shitposts = inMemoryRepository([
      aShitpost({ shitpostKey: 'media/poison.png', tags: [] }),
      aShitpost({ shitpostKey: 'media/fine.png', tags: [] }),
    ]);
    const flakyVision: VisionTagger = {
      suggestTags: async (image) => {
        if (image.bytes[0] === 66) {
          throw new Error('429 Too many requests');
        }
        return ['fresh'];
      },
    };
    const backfill = createBackfillTags({
      shitposts,
      media: inMemoryMediaStore({
        'media/poison.png': anImage({ bytes: new Uint8Array([66]) }),
      }),
      vision: flakyVision,
    });

    const summary = await backfill();

    expect(summary).toEqual({ tagged: 1, skipped: 0, failed: 1 });
    expect(
      (await shitposts.findAll()).find((s) => s.shitpostKey === 'media/fine.png')
        ?.tags,
    ).toEqual(['fresh']);
  });
});
