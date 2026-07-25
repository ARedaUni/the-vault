import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { shitpostSchema } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';
import { addShitpost } from '../usecases/add-shitpost';
import { listShitposts } from '../usecases/list-shitposts';

export type CatalogueEvent = {
  requestContext: { requestId?: string; http: { method: string } };
  rawPath?: string;
  body?: string;
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

type HandlerOptions = {
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

const dispatch = async (
  repository: ShitpostRepository,
  event: CatalogueEvent,
): Promise<{
  response: APIGatewayProxyStructuredResultV2;
  errorName?: string;
}> => {
  try {
    const method = event.requestContext.http.method;

    if (method === 'GET') {
      return { response: json(200, { shitposts: await listShitposts(repository) }) };
    }

    if (method === 'POST') {
      const parsed = shitpostSchema.safeParse(parseJson(event.body));
      if (!parsed.success) {
        return { response: json(400, { error: 'invalid shitpost' }) };
      }
      return {
        response: json(201, { shitpost: await addShitpost(repository, parsed.data) }),
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
  repository: ShitpostRepository,
  options: HandlerOptions = {},
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

    const { response, errorName } = await dispatch(repository, event);

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
