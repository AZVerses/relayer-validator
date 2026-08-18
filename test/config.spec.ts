import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { loadConfig, VALIDATOR_PROJECT_ROOT } from '../src/config';

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
    expect(config.callerPemPublicKey).toBeUndefined();
    expect(config.callerPemPublicKeySha256).toBeUndefined();
    expect(config.adminBasicAuthPassword).toBe('admin-password');
    expect(config.chainConfigs).toContainEqual({
      chainId: 42161,
      rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    });
  });

  it('uses AWS default credentials when access key and secret key are both absent', () => {
    const config = loadConfig(baseEnv());

    expect(config.awsAccessKeyId).toBe('');
    expect(config.awsSecretAccessKey).toBe('');
    expect(config.awsSessionToken).toBeUndefined();
  });

  it('resolves a relative LOG_PATH directory from the validator project root', () => {
    const config = loadConfig(baseEnv({ LOG_PATH: 'logs' }));

    expect(config.logPath).toBe(resolve(VALIDATOR_PROJECT_ROOT, 'logs'));
  });

  it('preserves absolute LOG_PATH directory values', () => {
    const config = loadConfig(baseEnv({ LOG_PATH: '/tmp/validator-logs' }));

    expect(config.logPath).toBe('/tmp/validator-logs');
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
      'HTTPS PEM public key requires CALLER_PEM_PUBLIC_KEY_SHA256 pinning',
    );
  });

  it('accepts an inline caller PEM without a path or pin', () => {
    const config = loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\ninline\\n-----END PUBLIC KEY-----',
      CALLER_PEM_PUBLIC_KEY_PATH: undefined,
    }));

    expect(config.callerPemPublicKey).toBe('-----BEGIN PUBLIC KEY-----\\ninline\\n-----END PUBLIC KEY-----');
    expect(config.callerPemPublicKeyPath).toBeUndefined();
    expect(config.callerPemPublicKeySha256).toBeUndefined();
  });

  it('rejects inline caller PEM combined with path or pin', () => {
    expect(() => loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY: 'inline-pem',
    }))).toThrow('CALLER_PEM_PUBLIC_KEY cannot be combined with CALLER_PEM_PUBLIC_KEY_PATH');

    expect(() => loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY: 'inline-pem',
      CALLER_PEM_PUBLIC_KEY_PATH: undefined,
      CALLER_PEM_PUBLIC_KEY_SHA256: 'a'.repeat(64),
    }))).toThrow('CALLER_PEM_PUBLIC_KEY cannot be combined with CALLER_PEM_PUBLIC_KEY_PATH');
  });

  it('requires one caller PEM source', () => {
    expect(() => loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY_PATH: undefined,
    }))).toThrow('CALLER_PEM_PUBLIC_KEY or CALLER_PEM_PUBLIC_KEY_PATH is required');
  });

  it('rejects malformed caller PEM SHA-256 pins', () => {
    expect(() => loadConfig(baseEnv({
      CALLER_PEM_PUBLIC_KEY_SHA256: 'not-a-sha',
    }))).toThrow('CALLER_PEM_PUBLIC_KEY_SHA256 must be a 64-character hex string');
  });

  it('parses per-chain relayer and RPC URLs', () => {
    const config = loadConfig(baseEnv({
      CHAIN_CONFIGS: JSON.stringify([
        {
          chainId: 42161,
          rpcUrl: 'https://arb.example.com/rpc',
          relayerUrl: 'http://arb-relayer:3000',
        },
        {
          chainId: 421614,
          rpcUrl: 'https://arb-sepolia.example.com/rpc',
          relayerUrl: 'http://arb-sepolia-relayer:3000',
        },
      ]),
    }));

    expect(config.chainConfigs).toEqual([
      {
        chainId: 42161,
        rpcUrl: 'https://arb.example.com/rpc',
        relayerUrl: 'http://arb-relayer:3000',
      },
      {
        chainId: 421614,
        rpcUrl: 'https://arb-sepolia.example.com/rpc',
        relayerUrl: 'http://arb-sepolia-relayer:3000',
      },
    ]);
  });

  it('uses legacy RELAYER_URL as a per-chain migration fallback', () => {
    const config = loadConfig(baseEnv({
      RELAYER_URL: 'http://relayer:3000',
      CHAIN_CONFIGS: JSON.stringify([{ chainId: 42161 }]),
    }));

    expect(config.chainConfigs).toEqual([{
      chainId: 42161,
      rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
      relayerUrl: 'http://relayer:3000',
    }]);
  });

  it('uses the built-in Arbitrum One RPC when rpcUrl is omitted', () => {
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
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
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
    }))).toThrow('CHAIN_CONFIGS[0].rpcUrl is required for chainId 999999');
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
