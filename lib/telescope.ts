import * as cdk from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export type TelescopeProps = {
  accessLogBucket: s3.IBucket;
};

export class Telescope extends Construct {
  readonly analyticsBucket: s3.Bucket;
  readonly database: glue.CfnDatabase;
  readonly table: glue.CfnTable;

  constructor(scope: Construct, id: string, props: TelescopeProps) {
    super(scope, id);

    this.analyticsBucket = new s3.Bucket(this, 'AnalyticsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      serverAccessLogsBucket: props.accessLogBucket,
      serverAccessLogsPrefix: 'analytics/',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.database = new glue.CfnDatabase(this, 'AnalyticsDatabase', {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: { name: 'signal_analytics' },
    });

    this.table = new glue.CfnTable(this, 'WideEventsTable', {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseName: this.database.ref,
      tableInput: {
        name: 'wide_events',
        tableType: 'EXTERNAL_TABLE',
        storageDescriptor: {
          location: this.analyticsBucket.s3UrlForObject('wide-events/'),
          inputFormat:
            'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
          outputFormat:
            'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
          serdeInfo: {
            serializationLibrary:
              'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
          },
          columns: [
            { name: 'timestamp', type: 'bigint' },
            { name: 'method', type: 'string' },
            { name: 'path', type: 'string' },
            { name: 'statuscode', type: 'string' },
            { name: 'durationms', type: 'double' },
            { name: 'coldstart', type: 'boolean' },
            { name: 'requestid', type: 'string' },
            { name: 'repositorydurationms', type: 'double' },
            { name: 'itemcount', type: 'int' },
            { name: 'errorname', type: 'string' },
          ],
        },
      },
    });
  }
}
