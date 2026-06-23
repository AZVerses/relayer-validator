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
      },
    ]);

    expect(chains).toEqual([
      {
        name: 'Arbitrum One',
        chainId: 42161,
        relayerUrl: 'http://localhost:3000',
        validatorServiceUrl: 'http://localhost:3001',
        graphUrl: 'https://graph.example.com/subgraphs/name/az-vault',
        explorerUrl: 'https://arbiscan.io',
        rpcUrl: 'https://arb.example.com/rpc',
        startBlock: 476067900,
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

  it('validates CHAIN_CONFIGS JSON shape', () => {
    expect(() => parseChainConfigOverrides('[{"chainId":42161,"graphUrl":""}]'))
      .toThrow('vaultAddress must be a 0x-prefixed address');
  });
});
