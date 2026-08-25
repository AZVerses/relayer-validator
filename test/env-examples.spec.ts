import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { mergeChainConfigs, parseChainConfigOverrides } from '../web/src/config/chain-registry';

const projectRoot = resolve(__dirname, '..');
const configurationDocs = [
  readFileSync(resolve(projectRoot, 'docs/tech/configuration.md'), 'utf8'),
  readFileSync(resolve(projectRoot, 'web/README.md'), 'utf8'),
].join('\n');

function readExample(relativePath: string): Record<string, string> {
  return parse(readFileSync(resolve(projectRoot, relativePath)));
}

describe('validator environment examples', () => {
  it('uses one CHAIN_CONFIGS payload accepted by both validator and Admin Web', () => {
    const env = readExample('.env.example');
    const webChains = mergeChainConfigs(parseChainConfigOverrides(env.CHAIN_CONFIGS));
    const validator = loadConfig({
      ...env,
      KMS_KEY_ID_VALIDATOR: 'validator-key',
      ADMIN_BASIC_AUTH_PASSWORD: 'admin-password',
    });

    expect(webChains[0]).toMatchObject({
      chainId: 42161,
      graphUrl: '',
      relayerUrl: 'http://arbitrum-relayer:3000',
    });
    expect(validator.chainConfigs[0]).toEqual({
      chainId: 42161,
      rpcUrl: 'https://your-arbitrum-rpc.example',
      relayerUrl: 'http://arbitrum-relayer:3000',
    });
  });

  it('keeps the standalone web example on the current schema', () => {
    const env = readExample('web/.env.example');
    const chains = mergeChainConfigs(parseChainConfigOverrides(env.CHAIN_CONFIGS));

    expect(chains).toHaveLength(1);
    expect(chains[0].chainId).toBe(42161);
    expect(chains[0].graphUrl).toBe('');
    expect(chains[0].relayerUrl).toBeTruthy();
  });

  it('documents every committed environment-example key', () => {
    const keys = new Set([
      ...Object.keys(readExample('.env.example')),
      ...Object.keys(readExample('web/.env.example')),
    ]);

    for (const key of keys) {
      expect(configurationDocs).toContain(`\`${key}\``);
    }
  });
});
