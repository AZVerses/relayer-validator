import { describe, expect, it } from 'vitest';
import { AwsKmsValidatorSignerBackend } from '../src/services/kms/backend';
import { loadConfig } from '../src/config';

const hasLiveEnv = Boolean(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.KMS_KEY_ID_VALIDATOR &&
  process.env.CALLER_PEM_PUBLIC_KEY_PATH,
);

describe('live AWS KMS integration', () => {
  it.skipIf(!hasLiveEnv)('loads validator address and signs digest', async () => {
    const config = loadConfig({
      ...process.env,
      CALLER_PEM_PUBLIC_KEY_PATH: process.env.CALLER_PEM_PUBLIC_KEY_PATH || 'resources/relayer.pem',
    });
    const backend = new AwsKmsValidatorSignerBackend(config);

    const address = await backend.getValidatorAddress();
    const signature = await backend.signDigest(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(signature).toMatch(/^0x[0-9a-fA-F]+$/);
  });
});
