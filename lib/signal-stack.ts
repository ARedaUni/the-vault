import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

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

    const gallery = new cloudfront.Distribution(this, 'GalleryDistribution', {
      webAclId: props?.webAclArn,
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
    });

    new cdk.CfnOutput(this, 'CatalogueTableName', {
      value: catalogueTable.tableName,
      description: 'Quest 1 — the catalogue: meme metadata + signals',
    });

    const catalogueFunction = new NodejsFunction(this, 'CatalogueFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: 'lambda/catalogue/handler.ts',
      logGroup: new logs.LogGroup(this, 'CatalogueFunctionLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        CATALOGUE_TABLE_NAME: catalogueTable.tableName,
      },
    });

    catalogueTable.grantReadWriteData(catalogueFunction);

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

    catalogueApi.addRoutes({
      path: '/shitposts',
      methods: [apigwv2.HttpMethod.POST],
      integration: catalogueIntegration,
      authorizer: new HttpUserPoolAuthorizer('VaultKeeperAuthorizer', vaultKeepers, {
        userPoolClients: [vaultKeepersClient],
      }),
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: vaultKeepers.userPoolId,
      description: 'Quest 3 — the membership office',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: vaultKeepersClient.userPoolClientId,
      description: 'Quest 3 — the front desk app for obtaining JWTs',
    });

    new cdk.CfnOutput(this, 'CatalogueApiUrl', {
      value: catalogueApi.apiEndpoint,
      description: 'Quest 2 — the gateway: GET /shitposts',
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
        id: 'AwsSolutions-CFR3',
        reason:
          'Access logging is Quest 4 (The Watchtower) work — deferred deliberately, not omitted. Single-user traffic until then.',
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

    NagSuppressions.addResourceSuppressions(catalogueApi.defaultStage!, [
      {
        id: 'AwsSolutions-APIG1',
        reason:
          'Access logging is Quest 4 (The Watchtower) work — structured logs and metrics land there together.',
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
