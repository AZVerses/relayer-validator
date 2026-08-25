import { describe, expect, it, vi } from 'vitest';
import { runWithdrawalAction } from '../web/src/utils/withdrawal-action-runner';

describe('withdrawal action loading lifecycle', () => {
  it('starts loading immediately and clears it only after the transaction returns', async () => {
    const events: string[] = [];
    let resolveTransaction!: () => void;
    const transaction = new Promise<void>((resolve) => { resolveTransaction = resolve; });

    const pending = runWithdrawalAction({
      ids: ['42'],
      markLoading: ids => events.push(`loading:${ids.join(',')}`),
      clearLoading: ids => events.push(`clear:${ids.join(',')}`),
      precheck: async () => { events.push('precheck'); return true; },
      submit: async () => { events.push('submit'); await transaction; events.push('tx-returned'); },
    });

    await vi.waitFor(() => expect(events).toEqual(['loading:42', 'precheck', 'submit']));
    resolveTransaction();
    await expect(pending).resolves.toBe(true);
    expect(events).toEqual(['loading:42', 'precheck', 'submit', 'tx-returned', 'clear:42']);
  });

  it('clears loading when precheck rejects the action', async () => {
    const events: string[] = [];
    const result = await runWithdrawalAction({
      ids: ['42'],
      markLoading: () => events.push('loading'),
      clearLoading: () => events.push('clear'),
      precheck: async () => false,
      submit: async () => { throw new Error('must not submit'); },
    });

    expect(result).toBe(false);
    expect(events).toEqual(['loading', 'clear']);
  });

  it('clears loading and rethrows transaction failures', async () => {
    const events: string[] = [];
    await expect(runWithdrawalAction({
      ids: ['42'],
      markLoading: () => events.push('loading'),
      clearLoading: () => events.push('clear'),
      precheck: async () => true,
      submit: async () => { throw new Error('transaction failed'); },
    })).rejects.toThrow('transaction failed');

    expect(events).toEqual(['loading', 'clear']);
  });
});
