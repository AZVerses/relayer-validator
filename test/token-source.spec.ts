import { describe, expect, it, vi } from 'vitest';
import { loadTokens } from '../web/src/data/token-source';
import type { GraphToken } from '../web/src/api/graph/queries';
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

const tokens: GraphToken[] = [{
  id: '0x2222222222222222222222222222222222222222',
  token: '0x2222222222222222222222222222222222222222',
  hardCapRatioBps: '5000',
  refillRateMps: '1000',
  lastRefillTimestamp: '1700000000',
  usedWithdrawHotAmount: '25',
  balance: '1000000',
}];

describe('token source selection', () => {
  it('uses The Graph exclusively when graphUrl is configured', async () => {
    const fetchGraph = vi.fn().mockResolvedValue(tokens);
    const fetchRelayer = vi.fn();

    await expect(loadTokens(
      { ...chain, graphUrl: 'https://graph.example.com' },
      { fetchGraph, fetchRelayer },
    )).resolves.toEqual(tokens);
    expect(fetchGraph).toHaveBeenCalledWith('https://graph.example.com');
    expect(fetchRelayer).not.toHaveBeenCalled();
  });

  it('uses relayer supported tokens when graphUrl is empty', async () => {
    const fetchGraph = vi.fn();
    const fetchRelayer = vi.fn().mockResolvedValue({
      chainId: chain.chainId,
      vaultAddress: chain.vaultAddress,
      tokens,
    });

    await expect(loadTokens(chain, { fetchGraph, fetchRelayer })).resolves.toEqual(tokens);
    expect(fetchGraph).not.toHaveBeenCalled();
    expect(fetchRelayer).toHaveBeenCalledWith(chain.chainId);
  });

  it('rejects a relayer response for another Vault', async () => {
    await expect(loadTokens(chain, {
      fetchGraph: vi.fn(),
      fetchRelayer: vi.fn().mockResolvedValue({
        chainId: chain.chainId,
        vaultAddress: '0x9999999999999999999999999999999999999999',
        tokens: [],
      }),
    })).rejects.toThrow('does not match configured chain 177');
  });
});
