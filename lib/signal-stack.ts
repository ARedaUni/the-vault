import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Telescope } from './telescope';

export type SignalStackProps = cdk.StackProps & {
  webAclArn?: string;
};

export class SignalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: SignalStackProps) {
    super(scope, id, props);

    const helloFunction = new lambda.Function(this, 'HelloFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      logGroup: new logs.LogGroup(this, 'HelloFunctionLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service: "signal", status: "online", quest: 0 }),
        });
      `),
    });

    const functionUrl = helloFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, 'SignalUrl', {
      value: functionUrl.url,
      description: 'Quest 0 — hit this with curl',
    });

    const hoardKey = new kms.Key(this, 'HoardKey', {
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: hoardKey,
      bucketKeyEnabled: true,
    });

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: mediaBucket.bucketName,
      description: 'Quest 1 — the vault: aws s3 sync the hoard here',
    });

    const galleryShell = new s3.Bucket(this, 'GalleryShellBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const accessLogBucket = new s3.Bucket(this, 'AccessLogBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });

    const gallery = new cloudfront.Distribution(this, 'GalleryDistribution', {
      webAclId: props?.webAclArn,
      enableLogging: true,
      logBucket: accessLogBucket,
      logFilePrefix: 'cloudfront/',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(galleryShell),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        'media/*': {
          origin: S3BucketOrigin.withOriginAccessControl(mediaBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'GalleryPageDeployment', {
      sources: [s3deploy.Source.asset('./frontend')],
      destinationBucket: galleryShell,
      distribution: gallery,
      distributionPaths: ['/index.html'],
    });

    new cdk.CfnOutput(this, 'GalleryUrl', {
      value: `https://${gallery.distributionDomainName}`,
      description: 'Quest 1.5 — the vault door: append /media/<key>',
    });

    const catalogueTable = new dynamodb.Table(this, 'CatalogueTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: hoardKey,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    new cdk.CfnOutput(this, 'CatalogueTableName', {
      value: catalogueTable.tableName,
      description: 'Quest 1 — the catalogue: meme metadata + signals',
    });

    const catalogueLogs = new logs.LogGroup(this, 'CatalogueFunctionLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const catalogueFunction = new NodejsFunction(this, 'CatalogueFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: 'lambda/catalogue/handler.ts',
      logGroup: catalogueLogs,
      environment: {
        CATALOGUE_TABLE_NAME: catalogueTable.tableName,
      },
    });

    catalogueTable.grantReadWriteData(catalogueFunction);

    const profileBuilderLogs = new logs.LogGroup(this, 'ProfileBuilderLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const profileBuilderFunction = new NodejsFunction(this, 'ProfileBuilderFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: 'lambda/profile-builder/handler.ts',
      logGroup: profileBuilderLogs,
      environment: {
        CATALOGUE_TABLE_NAME: catalogueTable.tableName,
      },
    });

    catalogueTable.grantWriteData(profileBuilderFunction);

    profileBuilderFunction.addEventSource(
      new DynamoEventSource(catalogueTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              Keys: { SK: { S: lambda.FilterRule.beginsWith('SIGNAL#') } },
            },
          }),
        ],
      }),
    );

    const catalogueApi = new apigwv2.HttpApi(this, 'CatalogueApi', {
      corsPreflight: {
        allowOrigins: [`https://${gallery.distributionDomainName}`],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
      },
    });

    const vaultKeepers = new cognito.UserPool(this, 'VaultKeepersPool', {
      selfSignUpEnabled: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
    });

    const vaultKeepersClient = vaultKeepers.addClient('VaultKeepersClient', {
      authFlows: { userPassword: true },
    });

    const catalogueIntegration = new HttpLambdaIntegration(
      'CatalogueIntegration',
      catalogueFunction,
    );

    const [publicListRoute] = catalogueApi.addRoutes({
      path: '/shitposts',
      methods: [apigwv2.HttpMethod.GET],
      integration: catalogueIntegration,
    });

    const vaultKeeperAuthorizer = new HttpUserPoolAuthorizer(
      'VaultKeeperAuthorizer',
      vaultKeepers,
      { userPoolClients: [vaultKeepersClient] },
    );

    catalogueApi.addRoutes({
      path: '/shitposts',
      methods: [apigwv2.HttpMethod.POST],
      integration: catalogueIntegration,
      authorizer: vaultKeeperAuthorizer,
    });

    catalogueApi.addRoutes({
      path: '/signals',
      methods: [apigwv2.HttpMethod.POST],
      integration: catalogueIntegration,
      authorizer: vaultKeeperAuthorizer,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: vaultKeepers.userPoolId,
      description: 'Quest 3 — the membership office',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: vaultKeepersClient.userPoolClientId,
      description: 'Quest 3 — the front desk app for obtaining JWTs',
    });

    const apiAccessLogs = new logs.LogGroup(this, 'CatalogueApiAccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const defaultStage = catalogueApi.defaultStage!.node
      .defaultChild as apigwv2.CfnStage;
    defaultStage.accessLogSettings = {
      destinationArn: apiAccessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        method: '$context.httpMethod',
        routeKey: '$context.routeKey',
        status: '$context.status',
        responseLength: '$context.responseLength',
        integrationError: '$context.integrationErrorMessage',
      }),
    };

    new cdk.CfnOutput(this, 'CatalogueApiUrl', {
      value: catalogueApi.apiEndpoint,
      description: 'Quest 2 — the gateway: GET /shitposts',
    });

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      masterKey: hoardKey,
      enforceSSL: true,
    });
    alarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('areda090@gmail.com'),
    );
    hoardKey.grantEncryptDecrypt(
      new iam.ServicePrincipal('cloudwatch.amazonaws.com'),
    );

    const errorAlarm = new cloudwatch.Alarm(this, 'CatalogueErrorAlarm', {
      alarmDescription:
        'Any catalogue error — at Vault traffic a single error burns a third of the monthly 99.9% budget',
      metric: new cloudwatch.Metric({
        namespace: 'Signal/Catalogue',
        metricName: 'errorCount',
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const latencyAlarm = new cloudwatch.Alarm(this, 'CatalogueLatencyAlarm', {
      alarmDescription:
        'p99 above one second for three consecutive periods — sustained slowness, not a lone cold start',
      metric: new cloudwatch.Metric({
        namespace: 'Signal/Catalogue',
        metricName: 'durationMs',
        statistic: cloudwatch.Stats.p(99),
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1000,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
    latencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    const catalogueMetric = (
      metricName: string,
      statistic: string,
      options: { dimensionsMap?: Record<string, string>; label?: string } = {},
    ): cloudwatch.Metric =>
      new cloudwatch.Metric({
        namespace: 'Signal/Catalogue',
        metricName,
        statistic,
        period: cdk.Duration.minutes(5),
        ...options,
      });

    const dashboard = new cloudwatch.Dashboard(this, 'VaultDashboard', {
      defaultInterval: cdk.Duration.hours(3),
    });

    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Pager state',
        alarms: [errorAlarm, latencyAlarm],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Errors (per 5 min)',
        left: [catalogueMetric('errorCount', cloudwatch.Stats.SUM)],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Latency p50 vs p99 (ms)',
        left: [
          catalogueMetric('durationMs', cloudwatch.Stats.p(50)),
          catalogueMetric('durationMs', cloudwatch.Stats.p(99)),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Traffic by method and status',
        left: [
          catalogueMetric('errorCount', cloudwatch.Stats.SAMPLE_COUNT, {
            dimensionsMap: { method: 'GET', statusCode: '200' },
            label: 'GET 200',
          }),
          catalogueMetric('errorCount', cloudwatch.Stats.SAMPLE_COUNT, {
            dimensionsMap: { method: 'POST', statusCode: '201' },
            label: 'POST 201',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Saturation — Lambda concurrency & DynamoDB throttles',
        left: [
          catalogueFunction.metric('ConcurrentExecutions', {
            statistic: cloudwatch.Stats.MAXIMUM,
            period: cdk.Duration.minutes(5),
          }),
          catalogueTable.metric('ThrottledRequests', {
            statistic: cloudwatch.Stats.SUM,
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 24,
        height: 6,
      }),
    );

    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboard.dashboardName,
      description: 'Quest 4 — the watchtower: one screen for the 3am question',
    });

    const telescope = new Telescope(this, 'Telescope', {
      accessLogBucket,
      wideEventLogGroup: catalogueLogs,
    });

    new cdk.CfnOutput(this, 'AnalyticsBucketName', {
      value: telescope.analyticsBucket.bucketName,
      description: 'Quest 4.5 — the telescope: wide events archived as Parquet',
    });

    NagSuppressions.addResourceSuppressions(gallery, [
      {
        id: 'AwsSolutions-CFR1',
        reason:
          'Personal archive accessed while travelling; geo restrictions would lock the owner out for no security gain.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason:
          'WAF stack exists behind -c waf=true; ~$7/mo not justified for a single-user archive. Shield Standard, OAC and JWT-on-writes cover the threat model.',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'Minimum TLS version is fixed by the default *.cloudfront.net certificate; raising it requires a custom domain + ACM cert (on the ledger).',
      },
    ]);

    NagSuppressions.addResourceSuppressions(mediaBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Read audit for the vault comes from CloudTrail KMS key-usage events; S3 server access logs would add a log bucket for one user\'s traffic.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(galleryShell, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Bucket holds one replaceable HTML file served via CloudFront; access logs of the shell have no audit value.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(publicListRoute, [
      {
        id: 'AwsSolutions-APIG4',
        reason:
          'GET /shitposts is public by design — the gallery is the product. Writes require a Cognito JWT.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(vaultKeepers, [
      {
        id: 'AwsSolutions-COG2',
        reason:
          'Single admin-created user, 12-char password policy, no self-signup. MFA lands with the real login UI (Vite app, on the ledger).',
      },
      {
        id: 'AwsSolutions-COG8',
        reason:
          'Plus-tier threat protection is priced per MAU; the pool has one admin-created user and no self-signup.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(accessLogBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'This is the access-log bucket; logging its own reads would recurse forever. Writes are restricted to the CloudFront log delivery service.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(
      helloFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWSLambdaBasicExecutionRole grants CloudWatch Logs write only — the least privilege this function needs.',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      catalogueFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWSLambdaBasicExecutionRole grants CloudWatch Logs write only — the least privilege this function needs.',
        },
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: ['Action::kms:ReEncrypt*', 'Action::kms:GenerateDataKey*'],
          reason:
            'Canonical KMS grant shape from grantReadWriteData: the wildcards cover the WithoutPlaintext/From/To variants of two actions, scoped to the single hoard key.',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      profileBuilderFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWSLambdaBasicExecutionRole grants CloudWatch Logs write only — the least privilege this function needs.',
        },
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: ['Action::kms:ReEncrypt*', 'Action::kms:GenerateDataKey*'],
          reason:
            'Canonical KMS grant shape from grantWriteData: the wildcards cover the WithoutPlaintext/From/To variants of two actions, scoped to the single hoard key.',
        },
        {
          id: 'AwsSolutions-IAM5',
          appliesTo: ['Resource::*'],
          reason:
            'dynamodb:ListStreams only accepts resource *; record reads stay scoped to the catalogue table stream ARN.',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${this.stackName}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C`,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'Runtime of the CDK-managed asset-deployment singleton is owned by aws-cdk-lib.',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'CDK-managed asset-deployment singleton uses the basic execution managed policy.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'CDK-generated copy permissions, scoped to the CDK asset bucket and the gallery shell bucket.',
        },
      ],
      true,
    );
  }
}
