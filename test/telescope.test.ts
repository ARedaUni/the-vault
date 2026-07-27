import { gzipSync } from 'node:zlib';
import { handler } from '../lambda/telescope/unwrap';

type LogEvent = { timestamp: number; message: string };

const aFirehoseRecord = (
  recordId: string,
  envelope: { messageType?: string; logEvents?: LogEvent[] },
) => ({
  recordId,
  data: gzipSync(
    JSON.stringify({
      messageType: 'DATA_MESSAGE',
      logGroup: '/aws/lambda/catalogue',
      logEvents: [],
      ...envelope,
    }),
  ).toString('base64'),
});

const decoded = (data: string): string =>
  Buffer.from(data, 'base64').toString('utf8');

test('unwraps gzipped log events into newline-delimited wide events stamped with the log timestamp', async () => {
  const wideEvent = { method: 'GET', statusCode: '200', durationMs: 42 };

  const response = await handler({
    records: [
      aFirehoseRecord('r1', {
        logEvents: [
          { timestamp: 1753500000000, message: JSON.stringify(wideEvent) },
          { timestamp: 1753500000500, message: JSON.stringify(wideEvent) },
        ],
      }),
    ],
  });

  expect(response.records).toHaveLength(1);
  expect(response.records[0]).toMatchObject({ recordId: 'r1', result: 'Ok' });
  const lines = decoded(response.records[0].data ?? '')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(lines).toEqual([
    { ...wideEvent, timestamp: 1753500000000 },
    { ...wideEvent, timestamp: 1753500000500 },
  ]);
});

test('unwraps a wide event carrying the Node runtime console.log prefix, as captured from the live log group', async () => {
  const capturedMessage =
    '2026-07-27T17:14:38.750Z\t54cdfca9-fdcb-49ed-8200-faf68a024e46\tINFO\t{"method":"GET","path":"/shitposts","statusCode":"200","durationMs":1144,"coldStart":true,"requestId":"BLO_mh-prPEEJdw=","repositoryDurationMs":923,"itemCount":91,"errorCount":0,"_aws":{"Timestamp":1785172478750,"CloudWatchMetrics":[{"Namespace":"Signal/Catalogue","Dimensions":[["method","statusCode"],[]],"Metrics":[{"Name":"durationMs","Unit":"Milliseconds"},{"Name":"errorCount","Unit":"Count"}]}]}}\n';

  const response = await handler({
    records: [
      aFirehoseRecord('r1', {
        logEvents: [{ timestamp: 1785172478750, message: capturedMessage }],
      }),
    ],
  });

  expect(response.records[0]).toMatchObject({ recordId: 'r1', result: 'Ok' });
  const line = JSON.parse(decoded(response.records[0].data ?? '').trim());
  expect(line).toMatchObject({
    method: 'GET',
    path: '/shitposts',
    durationMs: 1144,
    coldStart: true,
    timestamp: 1785172478750,
  });
});

test('drops Lambda runtime noise, keeping only lines that parse as JSON', async () => {
  const response = await handler({
    records: [
      aFirehoseRecord('r1', {
        logEvents: [
          { timestamp: 1, message: 'START RequestId: abc Version: $LATEST' },
          { timestamp: 2, message: JSON.stringify({ method: 'GET' }) },
          { timestamp: 3, message: 'END RequestId: abc' },
          { timestamp: 4, message: 'REPORT RequestId: abc Duration: 42 ms' },
        ],
      }),
    ],
  });

  const lines = decoded(response.records[0].data ?? '').trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toEqual({ method: 'GET', timestamp: 2 });
});

test('a record containing only runtime noise is dropped entirely', async () => {
  const response = await handler({
    records: [
      aFirehoseRecord('r1', {
        logEvents: [{ timestamp: 1, message: 'INIT_START Runtime Version: node' }],
      }),
    ],
  });

  expect(response.records).toEqual([{ recordId: 'r1', result: 'Dropped' }]);
});

test('CloudWatch control messages are dropped', async () => {
  const response = await handler({
    records: [
      aFirehoseRecord('r1', {
        messageType: 'CONTROL_MESSAGE',
        logEvents: [{ timestamp: 1, message: 'CWL CONTROL MESSAGE' }],
      }),
    ],
  });

  expect(response.records).toEqual([{ recordId: 'r1', result: 'Dropped' }]);
});

test('every incoming record gets exactly one response record with its own id', async () => {
  const response = await handler({
    records: [
      aFirehoseRecord('r1', {
        logEvents: [{ timestamp: 1, message: JSON.stringify({ a: 1 }) }],
      }),
      aFirehoseRecord('r2', {
        logEvents: [{ timestamp: 2, message: 'plain text' }],
      }),
    ],
  });

  expect(response.records.map((record) => record.recordId)).toEqual([
    'r1',
    'r2',
  ]);
  expect(response.records.map((record) => record.result)).toEqual([
    'Ok',
    'Dropped',
  ]);
});
