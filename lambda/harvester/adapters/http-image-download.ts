import { imageMediaTypeSchema } from '../../tagger/domain/media-store';
import type { ImageDownloader } from '../domain/media-upload';

export type BinaryHttpClient = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

const USER_AGENT = 'the-vault-harvester/1.0';

export const httpImageDownloader = (options: {
  http: BinaryHttpClient;
}): ImageDownloader => ({
  download: async (url) => {
    const response = await options.http(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`image download failed: ${response.status} for ${url}`);
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mediaType: imageMediaTypeSchema.parse(response.headers.get('content-type')),
    };
  },
});
