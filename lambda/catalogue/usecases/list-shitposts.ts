import type {
  ShitpostPage,
  ShitpostRepository,
} from '../../shared/domain/shitpost-repository';

const DEFAULT_LIMIT = 20;

/**
 * A ceiling, not a suggestion: without it a single query string could ask the
 * gallery to read the whole archive, which is the exact cost pagination exists
 * to avoid.
 */
const MAX_LIMIT = 100;

const requestedLimit = (limit?: string): number => {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

export const listShitposts = async (
  repository: ShitpostRepository,
  request: { limit?: string; cursor?: string } = {},
): Promise<ShitpostPage> =>
  repository.findLivePage({
    limit: requestedLimit(request.limit),
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
  });
