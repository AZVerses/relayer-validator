import { describe, expect, it } from 'vitest';
import { mergeChainConfigs, parseChainConfigOverrides } from '../web/src/config/chain-registry';

describe('admin web chain registry', () => {
  it('merges env overrides into built-in chain config', () => {
    const chains = mergeChainConfigs([
      {
        chainId: 42161,
        graphUrl: 'https://graph.example.com/subgraphs/name/az-vault',
        vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
        rpcUrl: 'https://arb.example.com/rpc',
        relayerUrl: 'https://arb-relayer.example.com',
      },
    ]);

    expect(chains).toEqual([
      {
        name: 'Arbitrum One',
        chainId: 42161,
        relayerUrl: 'https://arb-relayer.example.com',
        validatorServiceUrl: 'http://localhost:3001',
        graphUrl: 'https://graph.example.com/subgraphs/name/az-vault',
        explorerUrl: 'https://arbiscan.io',
        rpcUrl: 'https://arb.example.com/rpc',
        vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
      },
    ]);
  });

  it('supports multiple built-in chain ids', () => {
    const chains = mergeChainConfigs([
      {
        chainId: 42161,
        graphUrl: '',
        vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
        rpcUrl: 'https://arb.example.com/rpc',
      },
      {
        chainId: 421614,
        graphUrl: '',
        vaultAddress: '0xF2137A2D64bA4dAFcaB54959862f7384Ed7BE100',
        rpcUrl: 'https://arb-sepolia.example.com/rpc',
      },
    ]);

    expect(chains.map(chain => [chain.chainId, chain.rpcUrl])).toEqual([
      [42161, 'https://arb.example.com/rpc'],
      [421614, 'https://arb-sepolia.example.com/rpc'],
    ]);
  });

  it('rejects unsupported chain ids unless full metadata is provided', () => {
    expect(() => mergeChainConfigs([
      {
        chainId: 1,
        graphUrl: '',
        vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
      },
    ])).toThrow('unsupported chainId 1');
  });

  it('supports HashKey Chain when all deployment and routing metadata is configured', () => {
    const [chain] = mergeChainConfigs([
      {
        chainId: 177,
        name: 'HashKey Chain',
        graphUrl: '',
        vaultAddress: '0x1111111111111111111111111111111111111111',
        explorerUrl: 'https://hashkey.blockscout.com',
        rpcUrl: 'https://mainnet.hsk.xyz',
        relayerUrl: 'https://hashkey-relayer.example.com',
      },
    ]);

    expect(chain).toMatchObject({
      chainId: 177,
      relayerUrl: 'https://hashkey-relayer.example.com',
      rpcUrl: 'https://mainnet.hsk.xyz',
    });
  });

  it('validates CHAIN_CONFIGS JSON shape', () => {
    expect(() => parseChainConfigOverrides('[{"chainId":42161,"graphUrl":""}]'))
      .toThrow('vaultAddress must be a 0x-prefixed address');
  });

  it('rejects unknown CHAIN_CONFIGS fields', () => {
    expect(() => parseChainConfigOverrides('[{"chainId":42161,"vaultAddress":"0x949556cb8634F9a4a8504665C3d0D9d326c600b2","graphUrl":"","graphEnabled":false}]'))
      .toThrow('CHAIN_CONFIGS[0].graphEnabled is not supported');
  });

  it('accepts relayer-only fields in a shared CHAIN_CONFIGS payload', () => {
    const overrides = parseChainConfigOverrides(JSON.stringify([{
      chainId: 42161,
      vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
      graphUrl: '',
      rpcUrls: ['https://primary.example/rpc'],
      startBlock: 123,
      scanBlockBatchSize: 200,
    }]));

    expect(mergeChainConfigs(overrides)[0].rpcUrl)
      .toBe('https://arbitrum-one-rpc.publicnode.com');
  });

  it('uses the built-in Arbitrum One RPC when an override omits rpcUrl', () => {
    const chains = mergeChainConfigs([
      {
        chainId: 42161,
        graphUrl: '',
        vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
      },
    ]);

    expect(chains[0].rpcUrl).toBe('https://arbitrum-one-rpc.publicnode.com');
  });
});
