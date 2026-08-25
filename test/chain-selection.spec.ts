import { describe, expect, it } from 'vitest';
import { resolveSelectedChainId } from '../web/src/utils/chain-selection';

const chains = [{ chainId: 177 }, { chainId: 42161 }, { chainId: 421614 }];

describe('admin web chain selection', () => {
  it('uses the chain from the URL when it is configured', () => {
    expect(resolveSelectedChainId(chains, '177')).toBe(177);
  });

  it('defaults to Arbitrum One instead of configuration order', () => {
    expect(resolveSelectedChainId(chains, null)).toBe(42161);
  });

  it('replaces invalid or unavailable URL values with Arbitrum One', () => {
    expect(resolveSelectedChainId(chains, '42161x')).toBe(42161);
    expect(resolveSelectedChainId(chains, '1')).toBe(42161);
  });

  it('falls back to the first configured chain when Arbitrum One is unavailable', () => {
    expect(resolveSelectedChainId([{ chainId: 177 }], null)).toBe(177);
  });
});
