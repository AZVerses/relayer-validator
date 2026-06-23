import { describe, expect, it } from 'vitest';
import { deriveWithdrawalActionFlags } from '../web/src/utils/withdrawal-actions';
import type { Withdrawal } from '../web/src/types/withdrawal';

function withdrawal(overrides: Partial<Withdrawal>): Withdrawal {
  return {
    withdrawId: '1',
    chainId: 42161,
    lastEventType: 'WithdrawalAdded',
    amount: '10',
    fee: '0.01',
    tokenAddress: '0x1111111111111111111111111111111111111111',
    toAddress: '0x2222222222222222222222222222222222222222',
    timestamp: '900',
    isPending: true,
    isPaused: false,
    isExecuted: false,
    isFlushed: false,
    isForcePending: false,
    transactionHash: '0xabc',
    blockNumber: 1,
    transactionStatus: 'confirmed',
    ...overrides,
  };
}

describe('withdrawal action matrix', () => {
  const challengePeriod = 200;
  const unexpiredNow = 1000;
  const expiredNow = 1201;

  it('shows flush and pause for unexpired unpaused withdrawals', () => {
    expect(deriveWithdrawalActionFlags(withdrawal({ isPaused: false }), challengePeriod, unexpiredNow))
      .toMatchObject({ canFlush: true, canPause: true, canUnpause: false, canExecute: false });
  });

  it('shows only unpause for unexpired paused withdrawals', () => {
    expect(deriveWithdrawalActionFlags(withdrawal({ isPaused: true }), challengePeriod, unexpiredNow))
      .toMatchObject({ canFlush: false, canPause: false, canUnpause: true, canExecute: false });
  });

  it('shows only execute for expired unpaused withdrawals', () => {
    expect(deriveWithdrawalActionFlags(withdrawal({ isPaused: false }), challengePeriod, expiredNow))
      .toMatchObject({ canFlush: false, canPause: false, canUnpause: false, canExecute: true });
  });

  it('shows only unpause for expired paused withdrawals', () => {
    expect(deriveWithdrawalActionFlags(withdrawal({ isPaused: true }), challengePeriod, expiredNow))
      .toMatchObject({ canFlush: false, canPause: false, canUnpause: true, canExecute: false });
  });
});
