import * as cdk from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export type TelescopeProps = {
  accessLogBucket: s3.IBucket;
};

const WIDE_EVENTS_PREFIX = 'wide-events/';

export class Telescope extends Construct {
  readonly analyticsBucket: s3.Bucket;
  readonly database: glue.CfnDatabase;
  readonly table: glue.CfnTable;
  readonly deliveryStream: firehose.CfnDeliveryStream;

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
          location: this.analyticsBucket.s3UrlForObject(WIDE_EVENTS_PREFIX),
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

    const unwrapFunction = new NodejsFunction(this, 'UnwrapFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: 'lambda/telescope/unwrap.ts',
      handler: 'handler',
      timeout: cdk.Duration.minutes(1),
      logGroup: new logs.LogGroup(this, 'UnwrapFunctionLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    const deliveryRole = new iam.Role(this, 'DeliveryRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    });
    this.analyticsBucket.grantReadWrite(deliveryRole);
    unwrapFunction.grantInvoke(deliveryRole);
    deliveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['glue:GetTable', 'glue:GetTableVersion', 'glue:GetTableVersions'],
        resources: [
          cdk.Stack.of(this).formatArn({ service: 'glue', resource: 'catalog' }),
          cdk.Stack.of(this).formatArn({
            service: 'glue',
            resource: 'database',
            resourceName: this.database.ref,
          }),
          cdk.Stack.of(this).formatArn({
            service: 'glue',
            resource: 'table',
            resourceName: `${this.database.ref}/${this.table.ref}`,
          }),
        ],
      }),
    );

    this.deliveryStream = new firehose.CfnDeliveryStream(this, 'WideEventDelivery', {
      deliveryStreamType: 'DirectPut',
      extendedS3DestinationConfiguration: {
        bucketArn: this.analyticsBucket.bucketArn,
        roleArn: deliveryRole.roleArn,
        prefix: WIDE_EVENTS_PREFIX,
        errorOutputPrefix: 'errors/',
        bufferingHints: { intervalInSeconds: 300, sizeInMBs: 64 },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'Lambda',
              parameters: [
                {
                  parameterName: 'LambdaArn',
                  parameterValue: unwrapFunction.functionArn,
                },
              ],
            },
          ],
        },
        dataFormatConversionConfiguration: {
          enabled: true,
          inputFormatConfiguration: {
            deserializer: { openXJsonSerDe: {} },
          },
          outputFormatConfiguration: {
            serializer: { parquetSerDe: {} },
          },
          schemaConfiguration: {
            catalogId: cdk.Aws.ACCOUNT_ID,
            region: cdk.Aws.REGION,
            databaseName: this.database.ref,
            tableName: this.table.ref,
            roleArn: deliveryRole.roleArn,
            versionId: 'LATEST',
          },
        },
      },
    });
    this.deliveryStream.node.addDependency(deliveryRole);
  }
}
