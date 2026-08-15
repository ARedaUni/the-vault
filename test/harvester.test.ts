import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { httpImageDownloader } from '../lambda/harvester/adapters/http-image-download';
import { s3MediaUpload } from '../lambda/harvester/adapters/s3-media-upload';
import { secretsManagerFeedUrl } from '../lambda/harvester/adapters/secrets-manager-feed-url';
import { createHarvestSavedPosts } from '../lambda/harvester/usecases/harvest-saved-posts';
import type { SavedPost } from '../lambda/harvester/domain/saved-post';
import type { StoredImage } from '../lambda/shared/domain/media';
import { aShitpost, inMemoryRepository } from './support/catalogue';

const aSavedPost = (overrides: Partial<SavedPost> = {}): SavedPost => ({
  source: 'reddit',
  externalId: 'abc123',
  imageUrl: 'https://i.redd.it/abc123.jpg',
  ...overrides,
});

const anImage = (overrides: Partial<StoredImage> = {}): StoredImage => ({
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: 'image/jpeg',
  ...overrides,
});

const inMemoryMediaUpload = () => {
  let stored: Readonly<Record<string, StoredImage>> = {};
  return {
    store: async (key: string, image: StoredImage) => {
      stored = { ...stored, [key]: image };
    },
    storedKeys: () => Object.keys(stored),
  };
};

const fixedClock = () => '2026-08-04T09:00:00.000Z';

describe('harvest saved posts', () => {
  it('stores a saved image in the media store and catalogue with no tags', async () => {
    const shitposts = inMemoryRepository();
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: { fetchSaved: async () => [aSavedPost()] },
      images: { download: async () => anImage() },
      media,
      shitposts,
      now: fixedClock,
    });

    const summary = await harvest();

    expect(summary).toEqual({ harvested: 1, skipped: 0, failed: 0 });
    expect(media.storedKeys()).toEqual(['media/reddit/abc123.jpg']);
    expect(await shitposts.findAll()).toEqual([
      {
        shitpostKey: 'media/reddit/abc123.jpg',
        uploadedAt: '2026-08-04T09:00:00.000Z',
        tags: [],
      },
    ]);
  });

  it('files posts from different sources under their own media prefix', async () => {
    const shitposts = inMemoryRepository();
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: {
        fetchSaved: async () => [
          aSavedPost({ source: 'twitter', externalId: 'tw001', imageUrl: 'https://pbs.twimg.com/tw001.png' }),
        ],
      },
      images: { download: async () => anImage() },
      media,
      shitposts,
      now: fixedClock,
    });

    await harvest();

    expect(media.storedKeys()).toEqual(['media/twitter/tw001.png']);
  });

  it('skips posts whose derived key already exists in the catalogue', async () => {
    const shitposts = inMemoryRepository([
      aShitpost({ shitpostKey: 'media/reddit/abc123.jpg', tags: ['spongebob'] }),
    ]);
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: {
        fetchSaved: async () => [
          aSavedPost(),
          aSavedPost({ externalId: 'zzz999', imageUrl: 'https://i.redd.it/zzz999.png' }),
        ],
      },
      images: { download: async () => anImage() },
      media,
      shitposts,
      now: fixedClock,
    });

    const summary = await harvest();

    expect(summary).toEqual({ harvested: 1, skipped: 1, failed: 0 });
    expect(media.storedKeys()).toEqual(['media/reddit/zzz999.png']);
    expect(await shitposts.findAll()).toContainEqual(
      aShitpost({ shitpostKey: 'media/reddit/abc123.jpg', tags: ['spongebob'] }),
    );
  });

  it('counts a post whose download fails without abandoning the rest', async () => {
    const shitposts = inMemoryRepository();
    const media = inMemoryMediaUpload();
    const harvest = createHarvestSavedPosts({
      source: {
        fetchSaved: async () => [
          aSavedPost({ externalId: 'dead01', imageUrl: 'https://i.redd.it/dead01.jpg' }),
          aSavedPost({ externalId: 'alive2', imageUrl: 'https://i.redd.it/alive2.png' }),
        ],
      },
      images: {
        download: async (url) => {
          if (url.includes('dead01')) throw new Error('404 from reddit');
          return anImage();
        },
      },
      media,
      shitposts,
      now: fixedClock,
    });

    const summary = await harvest();

    expect(summary).toEqual({ harvested: 1, skipped: 0, failed: 1 });
    expect(media.storedKeys()).toEqual(['media/reddit/alive2.png']);
  });
});

describe('secrets manager feed url', () => {
  it('reads and validates the private feed url from the named secret', async () => {
    const secretsManager = mockClient(SecretsManagerClient);
    secretsManager
      .on(GetSecretValueCommand, { SecretId: 'the-vault/reddit' })
      .resolves({
        SecretString: JSON.stringify({
          feedUrl: 'https://www.reddit.com/saved.json?feed=feed-token&user=ali',
        }),
      });

    const fetchFeedUrl = secretsManagerFeedUrl({
      client: new SecretsManagerClient({}),
      secretId: 'the-vault/reddit',
    });

    expect(await fetchFeedUrl()).toBe(
      'https://www.reddit.com/saved.json?feed=feed-token&user=ali',
    );
  });

  it('rejects a secret whose feed url is not a url', async () => {
    const secretsManager = mockClient(SecretsManagerClient);
    secretsManager.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ feedUrl: 'not-a-url' }),
    });

    const fetchFeedUrl = secretsManagerFeedUrl({
      client: new SecretsManagerClient({}),
      secretId: 'the-vault/reddit',
    });

    await expect(fetchFeedUrl()).rejects.toThrow();
  });
});

describe('http image downloader', () => {
  const imageResponse = (overrides: {
    ok?: boolean;
    status?: number;
    contentType?: string | null;
  } = {}) => ({
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    headers: { get: () => overrides.contentType ?? 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
  });

  it('downloads bytes and takes the media type from the content-type header', async () => {
    const download = httpImageDownloader({
      http: async () => imageResponse(),
    }).download;

    expect(await download('https://i.redd.it/abc123.jpg')).toEqual({
      bytes: new Uint8Array([9, 8, 7]),
      mediaType: 'image/jpeg',
    });
  });

  it('rejects a response that is not a supported image', async () => {
    const download = httpImageDownloader({
      http: async () => imageResponse({ contentType: 'text/html' }),
    }).download;

    await expect(download('https://i.redd.it/gone.jpg')).rejects.toThrow();
  });

  it('rejects a failed response', async () => {
    const download = httpImageDownloader({
      http: async () => imageResponse({ ok: false, status: 404 }),
    }).download;

    await expect(download('https://i.redd.it/gone.jpg')).rejects.toThrow('404');
  });
});

describe('s3 media upload', () => {
  it('puts the image bytes under the key with its content type', async () => {
    const s3 = mockClient(S3Client);
    s3.on(PutObjectCommand).resolves({});

    const media = s3MediaUpload({
      client: new S3Client({}),
      bucketName: 'vault-media',
    });

    await media.store('reddit/abc123.jpg', {
      bytes: new Uint8Array([9, 8, 7]),
      mediaType: 'image/jpeg',
    });

    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(1);
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toEqual({
      Bucket: 'vault-media',
      Key: 'reddit/abc123.jpg',
      Body: new Uint8Array([9, 8, 7]),
      ContentType: 'image/jpeg',
    });
  });
});
