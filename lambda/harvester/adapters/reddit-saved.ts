import { z } from 'zod';
import type { SavedPostSource } from '../domain/saved-post';

export type HttpClient = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type RedditCredentials = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

const USER_AGENT = 'the-vault-harvester/1.0';

const tokenSchema = z.object({ access_token: z.string().min(1) });

const listingSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          id: z.string().min(1),
          url: z.string().min(1),
        }),
      }),
    ),
    after: z.string().nullable(),
  }),
});

const IMAGE_URL = /\.(jpg|jpeg|png|gif|webp)$/i;

export const redditSavedPostSource = (options: {
  http: HttpClient;
  credentials: RedditCredentials;
}): SavedPostSource => {
  const { http, credentials } = options;

  const fetchToken = async (): Promise<string> => {
    const basic = Buffer.from(
      `${credentials.clientId}:${credentials.clientSecret}`,
    ).toString('base64');
    const response = await http('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: credentials.username,
        password: credentials.password,
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`reddit token request failed: ${response.status}`);
    }
    return tokenSchema.parse(await response.json()).access_token;
  };

  return {
    fetchSaved: async () => {
      const token = await fetchToken();
      const posts = [];
      let after: string | null = null;
      do {
        const cursor = after === null ? '' : `&after=${after}`;
        const response = await http(
          `https://oauth.reddit.com/user/${credentials.username}/saved?limit=100&raw_json=1${cursor}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': USER_AGENT,
            },
          },
        );
        if (!response.ok) {
          throw new Error(`reddit saved request failed: ${response.status}`);
        }
        const listing = listingSchema.parse(await response.json());
        posts.push(
          ...listing.data.children
            .map((child) => child.data)
            .filter((post) => IMAGE_URL.test(post.url))
            .map((post) => ({ redditId: post.id, imageUrl: post.url })),
        );
        after = listing.data.after;
      } while (after !== null);
      return posts;
    },
  };
};
