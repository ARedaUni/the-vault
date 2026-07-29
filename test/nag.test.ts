import * as cdk from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { SignalStack } from '../lib/signal-stack';
import { WafStack } from '../lib/waf-stack';

const nagFindings = (stack: cdk.Stack) => {
  const annotations = Annotations.fromStack(stack);
  const pattern = Match.stringLikeRegexp('AwsSolutions-.*');
  return [
    ...annotations.findError('*', pattern),
    ...annotations.findWarning('*', pattern),
  ].map((finding) => `${finding.id}: ${finding.entry.data}`);
};

test('SignalStack carries no unsuppressed AwsSolutions findings', () => {
  const app = new cdk.App();
  const stack = new SignalStack(app, 'TestStack');
  cdk.Aspects.of(stack).add(new AwsSolutionsChecks());

  expect(nagFindings(stack)).toEqual([]);
});

test('GithubOidcStack carries no unsuppressed AwsSolutions findings', () => {
  const app = new cdk.App();
  const stack = new GithubOidcStack(app, 'TestGithubOidcStack', {
    env: { account: '111111111111', region: 'eu-west-2' },
  });
  cdk.Aspects.of(stack).add(new AwsSolutionsChecks());

  expect(nagFindings(stack)).toEqual([]);
});

test('WafStack carries no unsuppressed AwsSolutions findings', () => {
  const app = new cdk.App();
  const stack = new WafStack(app, 'TestWafStack', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
  cdk.Aspects.of(stack).add(new AwsSolutionsChecks());

  expect(nagFindings(stack)).toEqual([]);
});
