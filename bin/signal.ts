#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { SignalStack } from '../lib/signal-stack';
import { WafStack } from '../lib/waf-stack';

const app = new cdk.App();

new GithubOidcStack(app, 'SignalGithubOidcStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
  description: 'Signal — GitHub Actions OIDC provider and CDK deploy role',
});

const wafStack =
  app.node.tryGetContext('waf') === 'true'
    ? new WafStack(app, 'SignalWafStack', {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT,
          region: 'us-east-1',
        },
        crossRegionReferences: true,
        description: 'Signal — CloudFront-scoped WAF (must live in us-east-1)',
      })
    : undefined;

new SignalStack(app, 'SignalStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
  crossRegionReferences: true,
  webAclArn: wafStack?.webAclArn,
  description: 'Signal — personal audience-personalisation engine (Quest 0)',
});
