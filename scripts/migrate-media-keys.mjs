import {
  CopyObjectCommand,
  DeleteObjectCommand,
  S3Client,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const [bucketName, tableName] = process.argv.slice(2);
if (!bucketName || !tableName) {
  console.error('usage: node migrate-media-keys.mjs <bucket> <table>');
  process.exit(1);
}

const region = 'eu-west-2';
const s3 = new S3Client({ region });
const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const strayObjects = [];
for await (const page of paginateListObjectsV2(
  { client: s3 },
  { Bucket: bucketName, Prefix: 'reddit/' },
)) {
  strayObjects.push(...(page.Contents ?? []));
}
console.log(`${strayObjects.length} objects to move under media/`);

for (const object of strayObjects) {
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${encodeURIComponent(object.Key)}`,
      Key: `media/${object.Key}`,
    }),
  );
  console.log(`copied ${object.Key} -> media/${object.Key}`);
}

const strayRows = [];
let cursor;
do {
  const page = await dynamoDb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': 'SHITPOST', ':prefix': 'reddit/' },
      ExclusiveStartKey: cursor,
    }),
  );
  strayRows.push(...(page.Items ?? []));
  cursor = page.LastEvaluatedKey;
} while (cursor);
console.log(`${strayRows.length} catalogue rows to rewrite`);

for (const row of strayRows) {
  await dynamoDb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...row, SK: `media/${row.SK}` },
    }),
  );
  await dynamoDb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { PK: row.PK, SK: row.SK },
    }),
  );
  console.log(`moved row ${row.SK} (tags: ${(row.tags ?? []).length})`);
}

for (const object of strayObjects) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: object.Key }));
}
console.log(`deleted ${strayObjects.length} stray objects — migration complete`);
