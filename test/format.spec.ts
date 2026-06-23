import { describe, expect, it } from 'vitest';
import {
  formatDecimalAmount,
  formatTokenAmount,
  formatUnixSeconds,
  isZeroAddress,
} from '../web/src/utils/format';

describe('admin web amount formatting', () => {
  it('formats public query decimal amounts without applying token decimals again', () => {
    expect(formatDecimalAmount('10')).toBe('10');
    expect(formatDecimalAmount('0.01')).toBe('0.01');
    expect(formatDecimalAmount('1234567.890000')).toBe('1,234,567.89');
  });

  it('keeps raw base-unit formatting for on-chain and graph amounts', () => {
    expect(formatTokenAmount('10000000000000000000', { address: '0x1', name: 'ENA', symbol: 'ENA', decimals: 18 }))
      .toBe('10');
  });

  it('detects unset zero addresses', () => {
    expect(isZeroAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(isZeroAddress(undefined)).toBe(true);
    expect(isZeroAddress('0x1111111111111111111111111111111111111111')).toBe(false);
  });

  it('formats chain transaction timestamps as Unix seconds', () => {
    const formatted = formatUnixSeconds(1782149839);

    expect(formatted).not.toBeNull();
    expect(new Date(1782149839 * 1000).getFullYear()).toBe(2026);
    expect(formatted).toBe(new Date(1782149839 * 1000).toLocaleString());
  });

  it('rejects invalid Unix-second timestamps', () => {
    expect(formatUnixSeconds(0)).toBeNull();
    expect(formatUnixSeconds('not-a-timestamp')).toBeNull();
  });
});
