import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import type { RedditCredentials } from './reddit-saved';

const credentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export const secretsManagerRedditCredentials = (options: {
  client: SecretsManagerClient;
  secretId: string;
}): (() => Promise<RedditCredentials>) => async () => {
  const result = await options.client.send(
    new GetSecretValueCommand({ SecretId: options.secretId }),
  );
  if (result.SecretString === undefined) {
    throw new Error(`secret ${options.secretId} has no string value`);
  }
  return credentialsSchema.parse(JSON.parse(result.SecretString));
};
