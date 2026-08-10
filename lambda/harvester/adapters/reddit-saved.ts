import { z } from 'zod';
import type { SavedPostSource } from '../domain/saved-post';

export type HttpClient = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type RedditCredentials = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

const USER_AGENT = 'the-vault-harvester/1.0';

const tokenSchema = z.object({ access_token: z.string().min(1) });

export const listingSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          id: z.string().min(1),
          url: z.string().min(1).optional(),
        }),
      }),
    ),
    after: z.string().nullable(),
  }),
});

const IMAGE_URL = /\.(jpg|jpeg|png|gif|webp)$/i;

export const savedImagePosts = (
  listing: z.infer<typeof listingSchema>,
): { redditId: string; imageUrl: string }[] =>
  listing.data.children
    .map((child) => child.data)
    .flatMap((post) =>
      post.url !== undefined && IMAGE_URL.test(post.url)
        ? [{ redditId: post.id, imageUrl: post.url }]
        : [],
    );

const walkListing = async (options: {
  http: HttpClient;
  pageUrl: (after: string | null) => string;
  headers: Record<string, string>;
}) => {
  const posts = [];
  let after: string | null = null;
  do {
    const response = await options.http(options.pageUrl(after), {
      headers: options.headers,
    });
    if (!response.ok) {
      throw new Error(`reddit saved request failed: ${response.status}`);
    }
    const listing = listingSchema.parse(await response.json());
    posts.push(...savedImagePosts(listing));
    after = listing.data.after;
  } while (after !== null);
  return posts;
};

const ATOM_ENTRY = /<entry>[\s\S]*?<\/entry>/g;
const ENTRY_FULLNAME = /<id>(t\d+_[a-z0-9]+)<\/id>/;
const ENTRY_IMAGE_URL = /https:\/\/i\.redd\.it\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp)/i;

const atomEntries = (xml: string) =>
  [...xml.matchAll(ATOM_ENTRY)].flatMap((match) => {
    const fullname = match[0].match(ENTRY_FULLNAME)?.[1];
    return fullname === undefined
      ? []
      : [{ fullname, imageUrl: match[0].match(ENTRY_IMAGE_URL)?.[0] }];
  });

export const redditFeedSavedPostSource = (options: {
  http: HttpClient;
  feedUrl: string;
}): SavedPostSource => ({
  fetchSaved: async () => {
    const posts = [];
    const seen = new Set<string>();
    let after: string | null = null;
    for (;;) {
      const cursor: string = after === null ? '' : `&after=${after}`;
      const response = await options.http(
        `${options.feedUrl}&limit=100${cursor}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            Accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
      );
      if (!response.ok) {
        const body = (await response.text()).slice(0, 300);
        throw new Error(`reddit saved request failed: ${response.status} ${body}`);
      }
      const entries = atomEntries(await response.text());
      const fresh = entries.filter((entry) => !seen.has(entry.fullname));
      if (fresh.length === 0) return posts;

      fresh.forEach((entry) => seen.add(entry.fullname));
      posts.push(
        ...fresh.flatMap((entry) =>
          entry.fullname.startsWith('t3_') && entry.imageUrl !== undefined
            ? [{ redditId: entry.fullname.slice(3), imageUrl: entry.imageUrl }]
            : [],
        ),
      );
      after = fresh[fresh.length - 1].fullname;
    }
  },
});

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
      return walkListing({
        http,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': USER_AGENT,
        },
        pageUrl: (after) =>
          `https://oauth.reddit.com/user/${credentials.username}/saved?limit=100&raw_json=1${after === null ? '' : `&after=${after}`}`,
      });
    },
  };
};
