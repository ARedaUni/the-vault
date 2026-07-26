import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SignalStack } from '../lib/signal-stack';

const synthesize = () => {
  const app = new cdk.App();
  const stack = new SignalStack(app, 'TestStack');
  return Template.fromStack(stack);
};

test('the health endpoint is publicly callable without auth', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Lambda::Url', {
    AuthType: 'NONE',
  });
});

test('publishes the health endpoint URL as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('SignalUrl');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('logs expire after 30 days instead of accruing cost forever', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Logs::LogGroup', {
    RetentionInDays: 30,
  });
});

test('the media bucket blocks all public access', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

test('the media bucket rejects unencrypted (non-TLS) requests', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Deny',
          Action: 's3:*',
          Principal: { AWS: '*' },
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        }),
      ]),
    },
  });
});

test('the media bucket is retained when the stack is destroyed', () => {
  const template = synthesize();

  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
  });
});

test('publishes the media bucket name as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('MediaBucketName');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('the catalogue table uses generic PK/SK string keys for single-table design', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
  });
});

test('the catalogue table bills per request, not provisioned capacity', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
  });
});

test('the catalogue table is retained when the stack is destroyed', () => {
  const template = synthesize();

  template.hasResource('AWS::DynamoDB::Table', {
    DeletionPolicy: 'Retain',
  });
});

test('publishes the catalogue table name as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('CatalogueTableName');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('CloudFront serves viewers over HTTPS only', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultCacheBehavior: {
        ViewerProtocolPolicy: 'https-only',
      },
    },
  });
});

test('every CloudFront origin reaches its bucket via Origin Access Control', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Origins: [
        Match.objectLike({ OriginAccessControlId: Match.anyValue() }),
        Match.objectLike({ OriginAccessControlId: Match.anyValue() }),
      ],
    },
  });
});

test('bucket policies admit reads only from CloudFront, pinned to one distribution ARN', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Condition: {
            StringEquals: { 'AWS:SourceArn': Match.anyValue() },
          },
        }),
      ]),
    },
  });
});

test('the gallery shell bucket is deleted with the stack', () => {
  const template = synthesize();

  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

test('CloudFront serves index.html at the root path', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultRootObject: 'index.html',
    },
  });
});

test('CloudFront routes media/* to a separate origin from the default', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      CacheBehaviors: [Match.objectLike({ PathPattern: 'media/*' })],
    },
  });
});

test('publishes the gallery URL as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('GalleryUrl');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('the API routes GET /shitposts to a Lambda integration', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'GET /shitposts',
  });
});

test('the API routes POST /shitposts to a Lambda integration', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'POST /shitposts',
  });
});

test('API CORS permits only GET and POST, from a single allowed origin', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    CorsConfiguration: {
      AllowMethods: ['GET', 'POST'],
      AllowOrigins: [Match.anyValue()],
    },
  });
});

test('the catalogue Lambda role is allowed to query DynamoDB', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Allow',
          Action: Match.arrayWith(['dynamodb:Query']),
        }),
      ]),
    },
  });
});

test('the catalogue Lambda role is allowed to write to DynamoDB', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Allow',
          Action: Match.arrayWith(['dynamodb:PutItem']),
        }),
      ]),
    },
  });
});

test('the catalogue Lambda receives the table name via CATALOGUE_TABLE_NAME', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: {
        CATALOGUE_TABLE_NAME: Match.anyValue(),
      },
    },
  });
});

test('publishes the API URL as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('CatalogueApiUrl');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('the user pool forbids self sign-up — members are created by admins only', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Cognito::UserPool', {
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  });
});

test('POST /shitposts requires a valid user-pool JWT', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'POST /shitposts',
    AuthorizationType: 'JWT',
  });
});

test('GET /shitposts stays public so the gallery keeps loading', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'GET /shitposts',
    AuthorizationType: 'NONE',
  });
});

test('publishes user pool and client IDs for obtaining tokens', () => {
  const template = synthesize();

  expect(Object.keys(template.findOutputs('UserPoolId'))).toHaveLength(1);
  expect(Object.keys(template.findOutputs('UserPoolClientId'))).toHaveLength(1);
});

test('the media bucket is sealed with a customer-managed KMS key', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        Match.objectLike({
          ServerSideEncryptionByDefault: Match.objectLike({
            SSEAlgorithm: 'aws:kms',
          }),
        }),
      ],
    },
  });
});

test('the catalogue table is sealed with a customer-managed KMS key', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    SSESpecification: {
      SSEEnabled: true,
      KMSMasterKeyId: Match.anyValue(),
    },
  });
});

test('only one bucket carries the customer key — the public shell keeps defaults', () => {
  const template = synthesize();

  const kmsBuckets = Object.values(
    template.findResources('AWS::S3::Bucket'),
  ).filter((bucket) =>
    JSON.stringify(bucket.Properties?.BucketEncryption ?? {}).includes(
      'aws:kms',
    ),
  );
  expect(kmsBuckets).toHaveLength(1);
});

test('the gallery distribution wears the web ACL when one is supplied', () => {
  const app = new cdk.App();
  const stack = new SignalStack(app, 'TestStack', {
    webAclArn: 'arn:aws:wafv2:us-east-1:111111111111:global/webacl/test/abc',
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      WebACLId: 'arn:aws:wafv2:us-east-1:111111111111:global/webacl/test/abc',
    },
  });
});

test('the key rotates yearly and survives stack deletion — lose the key, lose the hoard', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::KMS::Key', {
    EnableKeyRotation: true,
  });
  template.hasResource('AWS::KMS::Key', {
    DeletionPolicy: 'Retain',
  });
});

test('any catalogue error within five minutes raises the alarm', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    Namespace: 'Signal/Catalogue',
    MetricName: 'errorCount',
    Statistic: 'Sum',
    Period: 300,
    Threshold: 1,
    EvaluationPeriods: 1,
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    TreatMissingData: 'notBreaching',
  });
});

test('sustained slow requests raise the latency alarm, one slow blip does not', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    Namespace: 'Signal/Catalogue',
    MetricName: 'durationMs',
    ExtendedStatistic: 'p99',
    Period: 300,
    Threshold: 1000,
    EvaluationPeriods: 3,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'notBreaching',
  });
});

test('the alarm topic pages the keeper by email', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'areda090@gmail.com',
  });
});

test('the API stage writes structured access logs naming the request and its fate', () => {
  const template = synthesize();

  const stages = Object.values(
    template.findResources('AWS::ApiGatewayV2::Stage'),
  );
  expect(stages.length).toBeGreaterThan(0);
  stages.forEach((stage) => {
    const accessLogSettings = stage.Properties.AccessLogSettings;
    expect(accessLogSettings.DestinationArn).toBeDefined();
    expect(accessLogSettings.Format).toContain('requestId');
    expect(accessLogSettings.Format).toContain('status');
    expect(accessLogSettings.Format).toContain('routeKey');
  });
});

test('CloudFront delivers viewer access logs to a log bucket', () => {
  const template = synthesize();

  template.hasResourceProperties(
    'AWS::CloudFront::Distribution',
    Match.objectLike({
      DistributionConfig: Match.objectLike({
        Logging: Match.objectLike({ Bucket: Match.anyValue() }),
      }),
    }),
  );
});

test('access logs expire instead of accruing cost forever', () => {
  const template = synthesize();

  const logBuckets = Object.values(
    template.findResources('AWS::S3::Bucket'),
  ).filter(
    (bucket) => bucket.Properties?.OwnershipControls?.Rules !== undefined,
  );
  expect(logBuckets).toHaveLength(1);
  expect(
    logBuckets[0].Properties.LifecycleConfiguration.Rules[0].ExpirationInDays,
  ).toBe(90);
});

const dashboardBody = (template: Template): string => {
  const dashboards = Object.values(
    template.findResources('AWS::CloudWatch::Dashboard'),
  );
  expect(dashboards).toHaveLength(1);
  return JSON.stringify(dashboards[0].Properties.DashboardBody).replace(
    /\\"/g,
    '"',
  );
};

test('the vault dashboard graphs the four golden signals', () => {
  const body = dashboardBody(synthesize());

  expect(body).toContain('Signal/Catalogue');
  expect(body).toContain('errorCount');
  expect(body).toContain('p99');
  expect(body).toContain('p50');
  expect(body).toContain('statusCode');
  expect(body).toContain('ConcurrentExecutions');
  expect(body).toContain('ThrottledRequests');
});

test('the dashboard leads with pager state and stays at five widgets', () => {
  const body = dashboardBody(synthesize());

  expect(body.match(/"type":"alarm"/g)).toHaveLength(1);
  expect(body.match(/"type":"metric"/g)).toHaveLength(4);
  expect(body.indexOf('"type":"alarm"')).toBeLessThan(
    body.indexOf('"type":"metric"'),
  );
});

test('every alarm publishes to the alarm topic when it fires', () => {
  const template = synthesize();

  const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
  expect(alarms.length).toBeGreaterThan(0);
  alarms.forEach((alarm) => {
    expect(alarm.Properties.AlarmActions).toHaveLength(1);
  });
});
