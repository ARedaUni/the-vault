import type { CanonicalRequestEvent } from '../routes/shitposts';

export const emfFormat = (
  event: CanonicalRequestEvent,
  options: { now?: () => number } = {},
): string => {
  const now = options.now ?? Date.now;

  return JSON.stringify({
    ...event,
    statusCode: String(event.statusCode),
    errorCount: event.errorName === undefined ? 0 : 1,
    _aws: {
      Timestamp: now(),
      CloudWatchMetrics: [
        {
          Namespace: 'Signal/Catalogue',
          Dimensions: [['method', 'statusCode'], []],
          Metrics: [
            { Name: 'durationMs', Unit: 'Milliseconds' },
            { Name: 'errorCount', Unit: 'Count' },
          ],
        },
      ],
    },
  });
};
