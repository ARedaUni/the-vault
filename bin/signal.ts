#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SignalStack } from '../lib/signal-stack';

const app = new cdk.App();
new SignalStack(app, 'SignalStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
  description: 'Signal — personal audience-personalisation engine (Quest 0)',
});
