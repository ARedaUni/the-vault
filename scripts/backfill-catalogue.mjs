import { S3Client, paginateListObjectsV2 } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const [bucketName, tableName] = process.argv.slice(2);
if (!bucketName || !tableName) {
  console.error('usage: node backfill-catalogue.mjs <bucket> <table>');
  process.exit(1);
}

const region = 'eu-west-2';
const s3 = new S3Client({ region });
const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const objects = [];
for await (const page of paginateListObjectsV2(
  { client: s3 },
  { Bucket: bucketName, Prefix: 'media/' },
)) {
  objects.push(...(page.Contents ?? []));
}
console.log(`vault holds ${objects.length} objects`);

const rows = objects.map((object) => ({
  PK: 'SHITPOST',
  SK: object.Key,
  uploadedAt: object.LastModified.toISOString(),
}));

const chunksOf = (size, items) =>
  items.length === 0 ? [] : [items.slice(0, size), ...chunksOf(size, items.slice(size))];

for (const chunk of chunksOf(25, rows)) {
  let pending = { [tableName]: chunk.map((row) => ({ PutRequest: { Item: row } })) };
  while (Object.keys(pending).length > 0) {
    const result = await dynamoDb.send(new BatchWriteCommand({ RequestItems: pending }));
    pending = result.UnprocessedItems ?? {};
    if (Object.keys(pending).length > 0) {
      console.log('retrying unprocessed items…');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.log(`wrote ${chunk.length} rows`);
}
console.log('backfill complete');
