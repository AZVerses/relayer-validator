import { describe, expect, it, vi } from 'vitest';
import { loadValidators } from '../web/src/data/validator-source';
import type { ChainConfig } from '../web/src/types/chain';

const chain: ChainConfig = {
  chainId: 177,
  name: 'HashKey Chain',
  relayerUrl: 'http://relayer:3000',
  validatorServiceUrl: 'http://validator:3001',
  graphUrl: '',
  explorerUrl: 'https://hashkey.blockscout.com',
  rpcUrl: 'https://mainnet.hsk.xyz',
  vaultAddress: '0x1111111111111111111111111111111111111111',
};

describe('validator source selection', () => {
  it('uses The Graph exclusively when graphUrl is configured', async () => {
    const graphValidators = [{
      id: 'graph-validator',
      address: '0x2222222222222222222222222222222222222222',
      chainId: '177',
      power: '40',
      validatorSetHash: `0x${'a'.repeat(64)}`,
    }];
    const fetchGraph = vi.fn().mockResolvedValue(graphValidators);
    const fetchRelayer = vi.fn();

    await expect(loadValidators(
      { ...chain, graphUrl: 'https://graph.example.com' },
      { fetchGraph, fetchRelayer },
    )).resolves.toEqual(graphValidators);
    expect(fetchGraph).toHaveBeenCalledWith('https://graph.example.com');
    expect(fetchRelayer).not.toHaveBeenCalled();
  });

  it('uses and normalizes relayer validator sets when graphUrl is empty', async () => {
    const fetchGraph = vi.fn();
    const fetchRelayer = vi.fn().mockResolvedValue({
      chainId: 177,
      vaultAddress: chain.vaultAddress,
      sets: [{
        hash: `0x${'b'.repeat(64)}`,
        totalPower: '100',
        requiredPower: '67',
        validators: [{
          address: '0x2222222222222222222222222222222222222222',
          power: '40',
        }],
      }],
    });

    await expect(loadValidators(chain, { fetchGraph, fetchRelayer })).resolves.toEqual([{
      id: `0x${'b'.repeat(64)}-0x2222222222222222222222222222222222222222`,
      address: '0x2222222222222222222222222222222222222222',
      chainId: '177',
      power: '40',
      validatorSetHash: `0x${'b'.repeat(64)}`,
      requiredPower: '67',
    }]);
    expect(fetchGraph).not.toHaveBeenCalled();
    expect(fetchRelayer).toHaveBeenCalledWith(177);
  });

  it('rejects a relayer response for another Vault', async () => {
    await expect(loadValidators(chain, {
      fetchGraph: vi.fn(),
      fetchRelayer: vi.fn().mockResolvedValue({
        chainId: 177,
        vaultAddress: '0x9999999999999999999999999999999999999999',
        sets: [],
      }),
    })).rejects.toThrow('does not match configured chain 177');
  });
});
