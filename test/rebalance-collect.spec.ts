import { describe, expect, it } from 'vitest';
import { buildRebalanceCollectSignRequest } from '../web/src/utils/rebalance';
import type { CollectionPayload } from '../web/src/types/rebalance';

describe('rebalance collection signing', () => {
  it('signs the exact payload frozen in the collection', () => {
    const payload: CollectionPayload = {
      action: 'rebalance-withdraw',
      chainId: 42161,
      vaultAddress: '0x949556cb8634F9a4a8504665C3d0D9d326c600b2',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '1000000000000000000',
      receiver: '0x2222222222222222222222222222222222222222',
      nonce: '123',
    };

    expect(buildRebalanceCollectSignRequest(payload)).toEqual(payload);
  });
});
