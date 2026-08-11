import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';

const feedSecretSchema = z.object({
  feedUrl: z.url(),
});

const secretJson = async (options: {
  client: SecretsManagerClient;
  secretId: string;
}): Promise<unknown> => {
  const result = await options.client.send(
    new GetSecretValueCommand({ SecretId: options.secretId }),
  );
  if (result.SecretString === undefined) {
    throw new Error(`secret ${options.secretId} has no string value`);
  }
  return JSON.parse(result.SecretString);
};

export const secretsManagerFeedUrl = (options: {
  client: SecretsManagerClient;
  secretId: string;
}): (() => Promise<string>) => async () =>
  feedSecretSchema.parse(await secretJson(options)).feedUrl;
