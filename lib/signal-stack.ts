import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class SignalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const helloFunction = new lambda.Function(this, 'HelloFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
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

    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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
    });

    new cdk.CfnOutput(this, 'CatalogueTableName', {
      value: catalogueTable.tableName,
      description: 'Quest 1 — the catalogue: meme metadata + signals',
    });

    const catalogueFunction = new NodejsFunction(this, 'CatalogueFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'lambda/catalogue/handler.ts',
      logGroup: new logs.LogGroup(this, 'CatalogueFunctionLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        CATALOGUE_TABLE_NAME: catalogueTable.tableName,
      },
    });

    catalogueTable.grantReadData(catalogueFunction);

    const catalogueApi = new apigwv2.HttpApi(this, 'CatalogueApi', {
      corsPreflight: {
        allowOrigins: [`https://${gallery.distributionDomainName}`],
        allowMethods: [apigwv2.CorsHttpMethod.GET],
      },
    });

    catalogueApi.addRoutes({
      path: '/shitposts',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'CatalogueIntegration',
        catalogueFunction,
      ),
    });

    new cdk.CfnOutput(this, 'CatalogueApiUrl', {
      value: catalogueApi.apiEndpoint,
      description: 'Quest 2 — the gateway: GET /shitposts',
    });
  }
}
