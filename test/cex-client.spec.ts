import { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { CexRiskClient } from '../src/services/cex/client';
import { createTestConfig, InMemorySignerBackend } from './helpers';

describe('CexRiskClient', () => {
  it('requests the CEX verify endpoint without the legacy /az prefix', async () => {
    const config = createTestConfig();
    config.cexApiUrl = 'https://cex.example.com/risk/';
    const request = vi.fn().mockResolvedValue({
      status: 200,
      data: { code: 0, msg: 'success', data: true },
    });
    const httpClient = { request } as unknown as AxiosInstance;
    const client = new CexRiskClient(config, new InMemorySignerBackend(), httpClient);

    await expect(client.checkSingleWithdrawRisk('42')).resolves.toMatchObject({ allowed: true });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://cex.example.com/risk/api/relayer/withdraw/verify',
      method: 'GET',
      params: { requestId: '42' },
    }));
  });
});
