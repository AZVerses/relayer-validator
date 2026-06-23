import axios, { AxiosInstance, isAxiosError } from 'axios';
import { z } from 'zod';
import { SignedPayload, SignRequest } from '../../types/actions';

export interface RelayerForwardResult {
  status: number;
  data: unknown;
}

const signWithdrawOperationBodySchema = z.object({
  request: z.unknown(),
  collectionId: z.number().int().positive().optional(),
});

export type SignWithdrawOperationBody = z.infer<typeof signWithdrawOperationBodySchema>;

export const signRebalanceRejectBodySchema = z.object({
  collectionId: z.number().int().positive(),
  chainId: z.number().int().positive(),
  vaultAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export type SignRebalanceRejectBody = z.infer<typeof signRebalanceRejectBodySchema>;

export { signWithdrawOperationBodySchema };

export class RelayerForwarder {
  private readonly httpClient: AxiosInstance;

  constructor(private readonly relayerUrl: string, httpClient?: AxiosInstance) {
    this.httpClient = httpClient ?? axios.create({ timeout: 30000 });
  }

  async submitValidatorAction(signed: SignedPayload, request: SignRequest, timestamp: number): Promise<RelayerForwardResult> {
    const body = {
      ...request,
      validatorAddress: signed.validatorAddress,
      signature: signed.signature,
      digest: signed.digest,
      timestamp,
    };
    return this.post('/api/validator-action', body);
  }

  async submitRebalanceCreate(signed: SignedPayload, request: SignRequest, timestamp: number): Promise<RelayerForwardResult> {
    if (request.action !== 'rebalance-withdraw') {
      throw new Error(`expected rebalance-withdraw request, got ${request.action}`);
    }
    return this.post('/api/signature-collections/rebalance-withdraw', {
      payload: request,
      validatorAddress: signed.validatorAddress,
      signature: signed.signature,
      timestamp,
    });
  }

  async submitRebalanceCollect(
    collectionId: number,
    signed: SignedPayload,
    timestamp: number,
  ): Promise<RelayerForwardResult> {
    return this.post(`/api/signature-collections/${collectionId}/collect`, {
      validatorAddress: signed.validatorAddress,
      signature: signed.signature,
      timestamp,
    });
  }

  async submitRebalanceReject(
    collectionId: number,
    signed: SignedPayload,
    timestamp: number,
  ): Promise<RelayerForwardResult> {
    return this.post(`/api/signature-collections/${collectionId}/reject`, {
      validatorAddress: signed.validatorAddress,
      signature: signed.signature,
      timestamp,
    });
  }

  private async post(path: string, body: Record<string, unknown>): Promise<RelayerForwardResult> {
    const url = `${this.relayerUrl.replace(/\/$/, '')}${path}`;
    try {
      const response = await this.httpClient.post(url, body, {
        headers: { 'content-type': 'application/json' },
      });
      return { status: response.status, data: response.data };
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        return { status: error.response.status, data: error.response.data };
      }
      throw error;
    }
  }
}
