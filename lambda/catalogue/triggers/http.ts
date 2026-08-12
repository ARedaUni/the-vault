import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { shitpostSchema } from '../../shared/domain/shitpost';
import { signalRequestSchema } from '../../shared/domain/signal';
import type { ShitpostRepository } from '../../shared/domain/shitpost-repository';
import type { SignalRepository } from '../domain/signal-repository';
import type { TasteProfileReader } from '../domain/taste-profile';
import { addShitpost } from '../usecases/add-shitpost';
import { listShitposts } from '../usecases/list-shitposts';
import { rankFeed } from '../usecases/rank-feed';
import { recordSignal } from '../usecases/record-signal';

export type CatalogueEvent = {
  requestContext: { requestId?: string; http: { method: string } };
  rawPath?: string;
  body?: string;
  queryStringParameters?: Record<string, string | undefined>;
};

export type CanonicalRequestEvent = {
  method: string;
  path?: string;
  statusCode: number;
  durationMs: number;
  coldStart: boolean;
  requestId?: string;
  errorName?: string;
  repositoryDurationMs?: number;
  itemCount?: number;
};

export type CataloguePorts = {
  shitposts: ShitpostRepository;
  signals: SignalRepository;
  profiles: TasteProfileReader;
};

export type TelemetryOptions = {
  emit?: (event: CanonicalRequestEvent) => void;
  now?: () => number;
  collect?: () => Pick<CanonicalRequestEvent, 'repositoryDurationMs' | 'itemCount'>;
};

const json = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const parseJson = (body?: string): unknown => {
  try {
    return JSON.parse(body ?? '');
  } catch {
    return undefined;
  }
};

const postSignal = async (
  ports: CataloguePorts,
  event: CatalogueEvent,
  now: () => number,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const parsed = signalRequestSchema.safeParse(parseJson(event.body));
  if (!parsed.success) {
    return json(400, { error: 'invalid signal' });
  }

  const signal = await recordSignal({
    shitposts: ports.shitposts,
    signals: ports.signals,
    request: parsed.data,
    signalledAt: new Date(now()).toISOString(),
  });
  if (!signal) {
    return json(404, { error: 'unknown shitpost' });
  }
  return json(201, { signal });
};

const getFeed = async (
  ports: CataloguePorts,
  event: CatalogueEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return json(400, { error: 'userId required' });
  }
  return json(200, {
    feed: await rankFeed({
      shitposts: ports.shitposts,
      profiles: ports.profiles,
      userId,
    }),
  });
};

const dispatch = async (
  ports: CataloguePorts,
  event: CatalogueEvent,
  now: () => number,
): Promise<{
  response: APIGatewayProxyStructuredResultV2;
  errorName?: string;
}> => {
  try {
    const method = event.requestContext.http.method;

    if (method === 'POST' && event.rawPath === '/signals') {
      return { response: await postSignal(ports, event, now) };
    }

    if (method === 'GET' && event.rawPath === '/feed') {
      return { response: await getFeed(ports, event) };
    }

    if (method === 'GET') {
      return {
        response: json(200, { shitposts: await listShitposts(ports.shitposts) }),
      };
    }

    if (method === 'POST') {
      const parsed = shitpostSchema.safeParse(parseJson(event.body));
      if (!parsed.success) {
        return { response: json(400, { error: 'invalid shitpost' }) };
      }
      return {
        response: json(201, {
          shitpost: await addShitpost(ports.shitposts, parsed.data),
        }),
      };
    }

    return { response: json(405, { error: 'method not allowed' }) };
  } catch (error) {
    console.error(error);
    return {
      response: json(500, { error: 'catalogue unavailable' }),
      errorName: error instanceof Error ? error.name : 'UnknownError',
    };
  }
};

export const createShitpostsHandler = (
  ports: CataloguePorts,
  options: TelemetryOptions = {},
) => {
  const emit = options.emit ?? (() => undefined);
  const now = options.now ?? Date.now;
  let nextRequestIsColdStart = true;

  return async (
    event: CatalogueEvent,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const startedAt = now();
    const coldStart = nextRequestIsColdStart;
    nextRequestIsColdStart = false;

    const { response, errorName } = await dispatch(ports, event, now);

    emit({
      method: event.requestContext.http.method,
      path: event.rawPath,
      statusCode: response.statusCode ?? 500,
      durationMs: now() - startedAt,
      coldStart,
      requestId: event.requestContext.requestId,
      ...(errorName === undefined ? {} : { errorName }),
      ...options.collect?.(),
    });

    return response;
  };
};
