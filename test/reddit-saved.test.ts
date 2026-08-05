import { redditSavedPostSource } from '../lambda/harvester/adapters/reddit-saved';

type CapturedRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

const aListing = (
  children: readonly unknown[],
  after: string | null = null,
) => ({ data: { children, after } });

const anImageChild = (id: string, url: string) => ({
  kind: 't3',
  data: { id, url },
});

const fakeReddit = (responsesByUrlPrefix: Record<string, () => unknown>) => {
  const requests: CapturedRequest[] = [];
  const http = async (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => {
    requests.push({ url, ...init });
    const prefix = Object.keys(responsesByUrlPrefix).find((p) => url.startsWith(p));
    if (prefix === undefined) throw new Error(`unexpected request: ${url}`);
    return {
      ok: true,
      status: 200,
      json: async () => responsesByUrlPrefix[prefix](),
    };
  };
  return { http, requests };
};

const credentials = {
  clientId: 'app-id',
  clientSecret: 'app-secret',
  username: 'ali',
  password: 'hunter2',
};

describe('reddit saved-post source', () => {
  it('authenticates with the password grant and returns saved image posts', async () => {
    const { http, requests } = fakeReddit({
      'https://www.reddit.com/api/v1/access_token': () => ({
        access_token: 'token-123',
      }),
      'https://oauth.reddit.com/user/ali/saved': () =>
        aListing([
          anImageChild('abc123', 'https://i.redd.it/abc123.jpg'),
          anImageChild('def456', 'https://i.redd.it/def456.png'),
        ]),
    });

    const source = redditSavedPostSource({ http, credentials });
    const saved = await source.fetchSaved();

    expect(saved).toEqual([
      { redditId: 'abc123', imageUrl: 'https://i.redd.it/abc123.jpg' },
      { redditId: 'def456', imageUrl: 'https://i.redd.it/def456.png' },
    ]);

    const [tokenRequest, savedRequest] = requests;
    expect(tokenRequest.method).toBe('POST');
    expect(tokenRequest.headers?.Authorization).toBe(
      `Basic ${Buffer.from('app-id:app-secret').toString('base64')}`,
    );
    expect(tokenRequest.body).toContain('grant_type=password');
    expect(tokenRequest.body).toContain('username=ali');
    expect(savedRequest.headers?.Authorization).toBe('Bearer token-123');
    expect(savedRequest.headers?.['User-Agent']).toContain('the-vault');
  });

  it('leaves out saved posts that are not images', async () => {
    const { http } = fakeReddit({
      'https://www.reddit.com/api/v1/access_token': () => ({
        access_token: 'token-123',
      }),
      'https://oauth.reddit.com/user/ali/saved': () =>
        aListing([
          anImageChild('text01', 'https://www.reddit.com/r/casualuk/comments/text01/'),
          anImageChild('vid002', 'https://v.redd.it/vid002'),
          anImageChild('img003', 'https://i.redd.it/img003.webp'),
        ]),
    });

    const source = redditSavedPostSource({ http, credentials });

    expect(await source.fetchSaved()).toEqual([
      { redditId: 'img003', imageUrl: 'https://i.redd.it/img003.webp' },
    ]);
  });

  it('follows the after cursor until the listing runs out', async () => {
    let savedCalls = 0;
    const pages = [
      aListing([anImageChild('page1', 'https://i.redd.it/page1.jpg')], 't3_page1'),
      aListing([anImageChild('page2', 'https://i.redd.it/page2.jpg')], null),
    ];
    const { http, requests } = fakeReddit({
      'https://www.reddit.com/api/v1/access_token': () => ({
        access_token: 'token-123',
      }),
      'https://oauth.reddit.com/user/ali/saved': () => pages[savedCalls++],
    });

    const source = redditSavedPostSource({ http, credentials });

    expect(await source.fetchSaved()).toEqual([
      { redditId: 'page1', imageUrl: 'https://i.redd.it/page1.jpg' },
      { redditId: 'page2', imageUrl: 'https://i.redd.it/page2.jpg' },
    ]);
    expect(requests[2].url).toContain('after=t3_page1');
  });
});
