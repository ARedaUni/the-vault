import type { SavedPostSource } from '../domain/saved-post';

export type HttpClient = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

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
  feedUrl: () => Promise<string>;
}): SavedPostSource => ({
  fetchSaved: async () => {
    const feedUrl = await options.feedUrl();
    const posts = [];
    const seen = new Set<string>();
    let after: string | null = null;
    for (;;) {
      const cursor: string = after === null ? '' : `&after=${after}`;
      const response = await options.http(
        `${feedUrl}&limit=100${cursor}`,
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
            ? [{ source: 'reddit', externalId: entry.fullname.slice(3), imageUrl: entry.imageUrl }]
            : [],
        ),
      );
      after = fresh[fresh.length - 1].fullname;
    }
  },
});
