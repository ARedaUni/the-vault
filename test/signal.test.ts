import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SignalStack } from '../lib/signal-stack';

const synthesize = () => {
  const app = new cdk.App();
  const stack = new SignalStack(app, 'TestStack');
  return Template.fromStack(stack);
};

test('serves a health endpoint over a public function URL', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Lambda::Url', {
    AuthType: 'NONE',
  });
});

test('grants anonymous callers both permissions required since October 2025', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Lambda::Permission', {
    Action: 'lambda:InvokeFunctionUrl',
    Principal: '*',
    FunctionUrlAuthType: 'NONE',
  });
  template.hasResourceProperties('AWS::Lambda::Permission', {
    Action: 'lambda:InvokeFunction',
    Principal: '*',
    InvokedViaFunctionUrl: true,
  });
});

test('exposes the URL as a stack output', () => {
  const template = synthesize();

  const outputs = template.findOutputs('SignalUrl');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('log output expires instead of accruing cost forever', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::Logs::LogGroup', {
    RetentionInDays: 30,
  });
});

test('keeps the media vault sealed against all public access', () => {
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

test('refuses unencrypted transport to the vault', () => {
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

test('the hoard survives stack deletion', () => {
  const template = synthesize();

  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
  });
});

test('publishes the vault bucket name for uploads', () => {
  const template = synthesize();

  const outputs = template.findOutputs('MediaBucketName');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('catalogues the hoard with generic entity-prefixed keys', () => {
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

test('pays per request rather than provisioning capacity', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
  });
});

test('the catalogue survives stack deletion', () => {
  const template = synthesize();

  template.hasResource('AWS::DynamoDB::Table', {
    DeletionPolicy: 'Retain',
  });
});

test('publishes the catalogue table name for the coming API', () => {
  const template = synthesize();

  const outputs = template.findOutputs('CatalogueTableName');
  expect(Object.keys(outputs)).toHaveLength(1);
});

test('the vault door serves the hoard over HTTPS only', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultCacheBehavior: {
        ViewerProtocolPolicy: 'https-only',
      },
    },
  });
});

test('the courier wears the modern badge: OAC, not legacy OAI', () => {
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

test('the loading dock admits only our own distribution', () => {
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

test('the gallery shell is replaceable — its bucket auto-destroys', () => {
  const template = synthesize();

  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

test('the door serves the gallery page at its root', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultRootObject: 'index.html',
    },
  });
});

test('routes media to the vault and everything else to the shell', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      CacheBehaviors: [Match.objectLike({ PathPattern: 'media/*' })],
    },
  });
});

test('ships the gallery page to the shell on every deploy', () => {
  const template = synthesize();

  template.resourceCountIs('Custom::CDKBucketDeployment', 1);
});

test('publishes the gallery URL for browsing the hoard', () => {
  const template = synthesize();

  const outputs = template.findOutputs('GalleryUrl');
  expect(Object.keys(outputs)).toHaveLength(1);
});
