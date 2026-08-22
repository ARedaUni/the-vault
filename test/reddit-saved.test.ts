import { redditFeedSavedPostSource } from '../lambda/harvester/adapters/reddit-feed-saved-post-source';

type CapturedRequest = {
  url: string;
  headers?: Record<string, string>;
};

const fakeReddit = (responsesByUrlPrefix: Record<string, () => unknown>) => {
  const requests: CapturedRequest[] = [];
  const http = async (
    url: string,
    init?: { headers?: Record<string, string> },
  ) => {
    requests.push({ url, ...init });
    const prefix = Object.keys(responsesByUrlPrefix).find((p) => url.startsWith(p));
    if (prefix === undefined) throw new Error(`unexpected request: ${url}`);
    return {
      ok: true,
      status: 200,
      text: async () => String(responsesByUrlPrefix[prefix]()),
    };
  };
  return { http, requests };
};

describe('reddit feed saved-post source', () => {
  const feedUrl = 'https://www.reddit.com/user/ali/saved.rss?feed=feed-token&user=ali';

  const anAtomEntry = (fullname: string, imageUrl?: string) =>
    `<entry><author><name>/u/someone</name></author><id>${fullname}</id><content type="html">${
      imageUrl === undefined
        ? '&lt;p&gt;just a text post&lt;/p&gt;'
        : `&lt;a href=&quot;${imageUrl}&quot;&gt;[link]&lt;/a&gt;`
    }</content><title>a post</title></entry>`;

  const anAtomFeed = (entries: readonly string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entries.join('')}</feed>`;

  it('walks the private atom feed and returns image posts', async () => {
    let calls = 0;
    const pages = [
      anAtomFeed([
        anAtomEntry('t3_page1', 'https://i.redd.it/page1.jpg'),
        anAtomEntry('t1_cmt001'),
        anAtomEntry('t3_text1'),
      ]),
      anAtomFeed([anAtomEntry('t3_page2', 'https://i.redd.it/page2.png')]),
      anAtomFeed([]),
    ];
    const { http, requests } = fakeReddit({
      'https://www.reddit.com/user/ali/saved.rss': () => pages[calls++],
    });

    const source = redditFeedSavedPostSource({ http, feedUrl: async () => feedUrl });

    expect(await source.fetchSaved()).toEqual([
      { source: 'reddit', externalId: 'page1', imageUrl: 'https://i.redd.it/page1.jpg' },
      { source: 'reddit', externalId: 'page2', imageUrl: 'https://i.redd.it/page2.png' },
    ]);
    expect(requests[0].url).toContain('feed=feed-token');
    expect(requests[0].url).toContain('limit=100');
    expect(requests[0].headers?.['User-Agent']).toContain('Mozilla');
    expect(requests[1].url).toContain('after=t3_text1');
    expect(requests[2].url).toContain('after=t3_page2');
  });

  it('stops when the feed repeats itself instead of looping forever', async () => {
    const samePage = anAtomFeed([
      anAtomEntry('t3_only1', 'https://i.redd.it/only1.jpg'),
    ]);
    const { http, requests } = fakeReddit({
      'https://www.reddit.com/user/ali/saved.rss': () => samePage,
    });

    const source = redditFeedSavedPostSource({ http, feedUrl: async () => feedUrl });

    expect(await source.fetchSaved()).toEqual([
      { source: 'reddit', externalId: 'only1', imageUrl: 'https://i.redd.it/only1.jpg' },
    ]);
    expect(requests.length).toBe(2);
  });
});
