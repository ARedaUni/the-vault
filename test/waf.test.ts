import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { WafStack } from '../lib/waf-stack';

const synthesize = () => {
  const app = new cdk.App();
  const stack = new WafStack(app, 'TestWafStack', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
};

test('the web ACL is CloudFront-scoped so it can guard the distribution', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::WAFv2::WebACL', {
    Scope: 'CLOUDFRONT',
    DefaultAction: { Allow: {} },
  });
});

test('the web ACL applies the AWS managed common rule set', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::WAFv2::WebACL', {
    Rules: Match.arrayWith([
      Match.objectLike({
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: 'AWS',
            Name: 'AWSManagedRulesCommonRuleSet',
          },
        },
      }),
    ]),
  });
});

test('the web ACL blocks IPs that exceed the rate limit', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::WAFv2::WebACL', {
    Rules: Match.arrayWith([
      Match.objectLike({
        Action: { Block: {} },
        Statement: {
          RateBasedStatement: Match.objectLike({
            AggregateKeyType: 'IP',
          }),
        },
      }),
    ]),
  });
});
