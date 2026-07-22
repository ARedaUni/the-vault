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
