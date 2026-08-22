import * as cdk from 'aws-cdk-lib';
import { BUNDLING_STACKS } from 'aws-cdk-lib/cx-api';

/**
 * Infrastructure assertions read CloudFormation, never the Lambda bundles, so
 * every synth here paid esbuild to rebuild five megabytes of handler for
 * nothing. An empty bundling-stacks context switches esbuild off; the deploy
 * path is unaffected, and the handlers have their own tests.
 */
export const anAppWithoutBundling = () =>
  new cdk.App({ context: { [BUNDLING_STACKS]: [] } });
