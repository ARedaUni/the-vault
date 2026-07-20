import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ShitpostRepository } from '../domain/shitpost-repository';
import { listShitposts } from '../usecases/list-shitposts';

export const createShitpostsHandler =
  (repository: ShitpostRepository) =>
  async (): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const shitposts = await listShitposts(repository);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shitposts }),
      };
    } catch (error) {
      console.error(error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'catalogue unavailable' }),
      };
    }
  };
