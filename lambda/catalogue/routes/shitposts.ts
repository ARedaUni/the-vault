import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { shitpostSchema } from '../domain/shitpost';
import type { ShitpostRepository } from '../domain/shitpost-repository';
import { addShitpost } from '../usecases/add-shitpost';
import { listShitposts } from '../usecases/list-shitposts';

export type CatalogueEvent = {
  requestContext: { http: { method: string } };
  body?: string;
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

export const createShitpostsHandler =
  (repository: ShitpostRepository) =>
  async (event: CatalogueEvent): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const method = event.requestContext.http.method;

      if (method === 'GET') {
        return json(200, { shitposts: await listShitposts(repository) });
      }

      if (method === 'POST') {
        const parsed = shitpostSchema.safeParse(parseJson(event.body));
        if (!parsed.success) {
          return json(400, { error: 'invalid shitpost' });
        }
        return json(201, { shitpost: await addShitpost(repository, parsed.data) });
      }

      return json(405, { error: 'method not allowed' });
    } catch (error) {
      console.error(error);
      return json(500, { error: 'catalogue unavailable' });
    }
  };
