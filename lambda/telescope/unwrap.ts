import { gunzipSync } from 'node:zlib';

export type FirehoseTransformEvent = {
  records: readonly { recordId: string; data: string }[];
};

export type FirehoseResponseRecord = {
  recordId: string;
  result: 'Ok' | 'Dropped' | 'ProcessingFailed';
  data?: string;
};

type LogsEnvelope = {
  messageType: string;
  logEvents: readonly { timestamp: number; message: string }[];
};

const parseJsonObject = (message: string): Record<string, unknown> | undefined => {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(message.slice(jsonStart));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const unwrapRecord = ({
  recordId,
  data,
}: FirehoseTransformEvent['records'][number]): FirehoseResponseRecord => {
  const envelope = JSON.parse(
    gunzipSync(Buffer.from(data, 'base64')).toString('utf8'),
  ) as LogsEnvelope;

  if (envelope.messageType !== 'DATA_MESSAGE') {
    return { recordId, result: 'Dropped' };
  }

  const wideEventLines = envelope.logEvents.flatMap((logEvent) => {
    const wideEvent = parseJsonObject(logEvent.message);
    return wideEvent === undefined
      ? []
      : [JSON.stringify({ ...wideEvent, timestamp: logEvent.timestamp })];
  });

  if (wideEventLines.length === 0) {
    return { recordId, result: 'Dropped' };
  }

  return {
    recordId,
    result: 'Ok',
    data: Buffer.from(wideEventLines.join('\n') + '\n').toString('base64'),
  };
};

export const handler = async (
  event: FirehoseTransformEvent,
): Promise<{ records: FirehoseResponseRecord[] }> => ({
  records: event.records.map(unwrapRecord),
});
