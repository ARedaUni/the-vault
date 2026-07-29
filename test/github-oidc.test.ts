import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { GithubOidcStack } from '../lib/github-oidc-stack';

const synthesize = () => {
  const app = new cdk.App();
  const stack = new GithubOidcStack(app, 'TestGithubOidcStack', {
    env: { account: '111111111111', region: 'eu-west-2' },
  });
  return Template.fromStack(stack);
};

test('the account trusts GitHub as an OIDC identity provider for STS', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::IAM::OIDCProvider', {
    Url: 'https://token.actions.githubusercontent.com',
    ClientIdList: ['sts.amazonaws.com'],
  });
});

test('only workflows on the-vault main branch can assume the deploy role', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: Match.objectLike({
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub':
                'repo:ARedaUni@124036817/the-vault@1305146249:ref:refs/heads/main',
            }),
          },
        }),
      ],
    },
  });
});

test('the deploy role can only step into the CDK bootstrap roles, nothing else', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Resource: 'arn:aws:iam::111111111111:role/cdk-*',
        },
      ],
    },
  });
});
