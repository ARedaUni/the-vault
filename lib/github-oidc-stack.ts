import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

const GITHUB_TOKEN_ISSUER = 'token.actions.githubusercontent.com';
const DEPLOYABLE_WORKFLOWS =
  'repo:ARedaUni@124036817/the-vault@1305146249:ref:refs/heads/main';

export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubProvider = new iam.CfnOIDCProvider(this, 'GithubOidcProvider', {
      url: `https://${GITHUB_TOKEN_ISSUER}`,
      clientIdList: ['sts.amazonaws.com'],
      thumbprintList: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'the-vault-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.attrArn, {
        StringEquals: {
          [`${GITHUB_TOKEN_ISSUER}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_TOKEN_ISSUER}:sub`]: DEPLOYABLE_WORKFLOWS,
        },
      }),
    });

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    NagSuppressions.addResourceSuppressions(
      deployRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'The role can only assume the CDK bootstrap roles; their names embed a ' +
            'generated qualifier (cdk-hnb659fds-deploy-role-…) so a cdk-* prefix ' +
            'wildcard scoped to this account is the tightest expressible match. ' +
            'The role grants no direct service permissions.',
          appliesTo: [`Resource::arn:aws:iam::${this.account}:role/cdk-*`],
        },
      ],
      true,
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}
