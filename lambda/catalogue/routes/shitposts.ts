import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ShitpostRepository } from '../domain/shitpost-repository';
import { listShitposts } from '../usecases/list-shitposts';

export const createShitpostsHandler =
  (repository: ShitpostRepository) =>
  async (): Promise<APIGatewayProxyStructuredResultV2> => {
    const shitposts = await listShitposts(repository);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shitposts }),
    };
  };
