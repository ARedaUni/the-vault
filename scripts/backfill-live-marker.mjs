import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Every shitpost written before the byUploadedAt index existed lacks
// liveMarker, and the index is sparse — so without this backfill those rows
// are simply absent from it and the gallery comes back empty.

const [tableName, expectedAccount] = process.argv.slice(2);
if (!tableName || !expectedAccount) {
  console.error('usage: node backfill-live-marker.mjs <table> <expected-account-id>');
  process.exit(1);
}

const region = 'eu-west-2';
const client = new DynamoDBClient({ region });
const dynamoDb = DynamoDBDocumentClient.from(client);

const { Table: table } = await client.send(
  new DescribeTableCommand({ TableName: tableName }),
);

// The default profile on this machine points at a work account. Checking the
// account off the table's own ARN names the thing about to be written to,
// rather than trusting whichever credentials happened to be in the shell.
const [, , , , account] = table.TableArn.split(':');
if (account !== expectedAccount) {
  console.error(`refusing to run: ${tableName} lives in ${account}, not ${expectedAccount}`);
  process.exit(1);
}

// Marking rows for an index that was never deployed writes an attribute
// nothing reads, and the empty gallery it was meant to fix stays empty.
const indexed = (table.GlobalSecondaryIndexes ?? []).some(
  (index) => index.IndexName === 'byUploadedAt',
);
if (!indexed) {
  console.error(`refusing to run: ${tableName} has no byUploadedAt index — deploy the stack first`);
  process.exit(1);
}

const rows = [];
let cursor;
do {
  const page = await dynamoDb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'SHITPOST' },
      ExclusiveStartKey: cursor,
    }),
  );
  rows.push(...(page.Items ?? []));
  cursor = page.LastEvaluatedKey;
} while (cursor);

const needsMarker = rows.filter(
  (row) => row.deletedAt === undefined && row.liveMarker === undefined,
);
console.log(`${rows.length} shitposts, ${needsMarker.length} missing the live marker`);

let marked = 0;
let skipped = 0;
for (const row of needsMarker) {
  try {
    await dynamoDb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: row.PK, SK: row.SK },
        UpdateExpression: 'SET liveMarker = :marker',
        ExpressionAttributeValues: { ':marker': 'LIVE' },
        // Re-running is safe, and a shitpost deleted since the scan began
        // must not be resurrected into the index by this backfill.
        ConditionExpression: 'attribute_exists(SK) AND attribute_not_exists(deletedAt)',
      }),
    );
    marked += 1;
    console.log(`marked ${row.SK}`);
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') {
      throw error;
    }
    skipped += 1;
    console.log(`skipped ${row.SK} — deleted while the backfill was running`);
  }
}

console.log(`backfill complete — ${marked} rows now visible to byUploadedAt, ${skipped} skipped`);
