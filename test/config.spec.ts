import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    KMS_KEY_ID_VALIDATOR: 'validator-key',
    CALLER_PEM_PUBLIC_KEY_PATH: 'resources/relayer.pem',
    CEX_API_URL: 'https://cex.example.com',
    ADMIN_BASIC_AUTH_PASSWORD: 'admin-password',
    ...overrides,
  };
}

describe('loadConfig', () => {
  it('accepts local caller PEM without a SHA-256 pin', () => {
    const config = loadConfig(baseEnv());

    expect(config.callerPemPublicKeyPath).toBe('resources/relayer.pem');
    expect(config.callerPemPublicKeySha256).toBeUndefined();
    expect(config.adminBasicAuthPassword).toBe('admin-password');
  });

  it('uses AWS default credentials when access key and secret key are both absent', () => {
    const config = loadConfig(baseEnv());

    expect(config.awsAccessKeyId).toBe('');
    expect(config.awsSecretAccessKey).toBe('');
    expect(config.awsSessionToken).toBeUndefined();
  });

  it('accepts explicit AWS access key and secret key together', () => {
    const config = loadConfig(baseEnv({
      AWS_ACCESS_KEY_ID: 'access-key',
      AWS_SECRET_ACCESS_KEY: 'secret-key',
      AWS_SESSION_TOKEN: 'session-token',
    }));

    expect(config.awsAccessKeyId).toBe('access-key');
    expect(config.awsSecretAccessKey).toBe('secret-key');
    expect(config.awsSessionToken).toBe('session-token');
  });

  it('rejects AWS access key without secret key', () => {
    expect(() => loadConfig(baseEnv({
      AWS_ACCESS_KEY_ID: 'access-key',
    }))).toThrow('AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set');
  });

  it('rejects AWS secret key without access key', () => {
    expect(() => loadConfig(baseEnv({
      AWS_SECRET_ACCESS_KEY: 'secret-key',
    }))).toThrow('AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set');
  });

  it('rejects AWS session token without explicit access key and secret key', () => {
    expect(() => loadConfig(baseEnv({
      AWS_SESSION_TOKEN: 'session-token',
    }))).toThrow('AWS_SESSION_TOKEN requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  });

  it('accepts local caller PEM with a SHA-256 pin', () => {
    const config = loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY_SHA256: 'a'.repeat(64),
    }));

    expect(config.callerPemPublicKeySha256).toBe('a'.repeat(64));
  });

  it('requires a SHA-256 pin for HTTPS caller PEM URLs', () => {
    expect(() => loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY_PATH: 'https://cdn.example.com/relayer.pem',
    }))).toThrow(
      'CALLER_PEM_PUBLIC_KEY_SHA256 is required when CALLER_PEM_PUBLIC_KEY_PATH is an HTTPS URL',
    );
  });

  it('rejects malformed caller PEM SHA-256 pins', () => {
    expect(() => loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY_SHA256: 'not-a-sha',
    }))).toThrow('CALLER_PEM_PUBLIC_KEY_SHA256 must be a 64-character hex string');
  });

  it('parses global relayer URL and per-chain RPC URLs', () => {
    const config = loadConfig(baseEnv({
      RELAYER_URL: 'http://relayer:3000',
      CHAIN_CONFIGS: JSON.stringify([
        {
          chainId: 42161,
          rpcUrl: 'https://arb.example.com/rpc',
        },
        {
          chainId: 421614,
          rpcUrl: 'https://arb-sepolia.example.com/rpc',
        },
      ]),
    }));

    expect(config.relayerUrl).toBe('http://relayer:3000');
    expect(config.chainConfigs).toEqual([
      {
        chainId: 42161,
        rpcUrl: 'https://arb.example.com/rpc',
      },
      {
        chainId: 421614,
        rpcUrl: 'https://arb-sepolia.example.com/rpc',
      },
    ]);
  });

  it('uses built-in RPC URL for known chains when CHAIN_CONFIGS omits rpcUrl', () => {
    const config = loadConfig(baseEnv({
      CHAIN_CONFIGS: JSON.stringify([
        {
          chainId: 42161,
        },
      ]),
    }));

    expect(config.chainConfigs).toEqual([
      {
        chainId: 42161,
        rpcUrl: 'https://solitary-empty-shard.arbitrum-mainnet.quiknode.pro/c3231ec35435fecf285eaa7e4b5010dc75881ec0/',
      },
    ]);
  });

  it('requires rpcUrl for custom chain ids', () => {
    expect(() => loadConfig(baseEnv({
      CHAIN_CONFIGS: JSON.stringify([
        {
          chainId: 999999,
        },
      ]),
    }))).toThrow('CHAIN_CONFIGS[0].rpcUrl is required for custom chainId 999999');
  });

  it('rejects duplicate chain ids in CHAIN_CONFIGS', () => {
    expect(() => loadConfig(baseEnv({
      CHAIN_CONFIGS: JSON.stringify([
        { chainId: 42161, rpcUrl: 'https://arb-a.example.com/rpc' },
        { chainId: 42161, rpcUrl: 'https://arb-b.example.com/rpc' },
      ]),
    }))).toThrow('CHAIN_CONFIGS must not contain duplicate chainId 42161');
  });
});
