import { describe, expect, it, vi } from 'vitest';
import { buildDigest } from '../src/services/signing/digests';
import { SigningService } from '../src/services/signing/service';
import { batchFlushWithdrawalsSchema, rebalanceWithdrawSchema, requestWithdrawSchema } from '../src/types/actions';
import { createTestConfig, InMemorySignerBackend } from './helpers';
import { CexRiskClient } from '../src/services/cex/client';

describe('buildDigest', () => {
  it('builds requestWithdraw digest using current relayer semantics', () => {
    const digest = buildDigest(requestWithdrawSchema.parse({
      action: 'request-withdraw',
      withdrawalId: '42',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '100',
      fee: '3',
      receiver: '0x3333333333333333333333333333333333333333',
      isForcePending: false,
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '9',
    }));

    expect(digest).toBe('0xdcfa7ba6640fd9cb9d2efe0d23cc15bcb61b67de9dd40071be2e9eaf93b8421c');
  });

  it('builds batchFlushWithdrawals digest', () => {
    const digest = buildDigest(batchFlushWithdrawalsSchema.parse({
      action: 'batch-flush-withdrawals',
      withdrawalIds: ['1', '2'],
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '8',
    }));

    expect(digest).toBe('0x3684b3de4ec8f4352ae1a1366b628bde88fd48aa64a62000b61bb02741ee15ac');
  });

  it('builds rebalanceWithdraw digest', () => {
    const digest = buildDigest(rebalanceWithdrawSchema.parse({
      action: 'rebalance-withdraw',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '10',
      receiver: '0x3333333333333333333333333333333333333333',
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '12',
    }));

    expect(digest).toBe('0xf5974af3ffdd69fedf14f05cb8cee8775e3e20e706366d902b3f8dac11a0100e');
  });
});

describe('SigningService', () => {
  it('hits CEX /verify once per user-scoped withdraw and signs on allow', async () => {
    const config = createTestConfig();
    const backend = new InMemorySignerBackend();
    const cexRiskClient = {
      checkSingleWithdrawRisk: vi.fn().mockResolvedValue({
        allowed: true,
        raw: { code: 0, msg: 'success', data: true },
      }),
    } as unknown as CexRiskClient;
    const service = new SigningService(config, backend, cexRiskClient);

    const result = await service.sign({
      action: 'request-withdraw',
      withdrawalId: '42',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '100',
      fee: '3',
      receiver: '0x3333333333333333333333333333333333333333',
      isForcePending: false,
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '9',
    });

    expect(result.validatorAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(result.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(result.riskCheck.allowed).toBe(true);
    expect(cexRiskClient.checkSingleWithdrawRisk).toHaveBeenCalledTimes(1);
    expect(cexRiskClient.checkSingleWithdrawRisk).toHaveBeenCalledWith('42');
  });

  it('rejects signing when CEX denies', async () => {
    const config = createTestConfig();
    const backend = new InMemorySignerBackend();
    const cexRiskClient = {
      checkSingleWithdrawRisk: vi.fn().mockResolvedValue({
        allowed: false,
        raw: { code: 0, msg: 'success', data: false },
      }),
    } as unknown as CexRiskClient;
    const service = new SigningService(config, backend, cexRiskClient);

    await expect(
      service.sign({
        action: 'request-withdraw',
        withdrawalId: '42',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '100',
        fee: '3',
        receiver: '0x3333333333333333333333333333333333333333',
        isForcePending: false,
        chainId: 11155111,
        vaultAddress: '0x2222222222222222222222222222222222222222',
        nonce: '9',
      }),
    ).rejects.toThrow(/Risk check denied/);
  });

  it('skips CEX for operator-scope actions (rebalance-withdraw)', async () => {
    const config = createTestConfig();
    const backend = new InMemorySignerBackend();
    const cexRiskClient = {
      checkSingleWithdrawRisk: vi.fn(),
    } as unknown as CexRiskClient;
    const service = new SigningService(config, backend, cexRiskClient);

    const result = await service.sign({
      action: 'rebalance-withdraw',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '10',
      receiver: '0x3333333333333333333333333333333333333333',
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '12',
    });

    expect(result.riskCheck.allowed).toBe(true);
    expect(result.riskCheck.tags).toContain('skip-cex-verify');
    expect(cexRiskClient.checkSingleWithdrawRisk).not.toHaveBeenCalled();
  });
});
