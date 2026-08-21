import axios, { AxiosInstance, isAxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { AppConfig } from '../../config';
import { ValidatorSignerBackend } from '../kms/backend';
import { buildSignedMessage } from '../http/signature';

const VERIFY_PATH = '/api/relayer/withdraw/verify';

interface CexVerifyResponse {
  code: number;
  msg: string;
  data: boolean | null;
}

export interface CexVerifyResult {
  allowed: boolean;
  raw: CexVerifyResponse;
}

export interface CexRiskLogger {
  info(bindings: Record<string, unknown>, message: string): void;
}

export class CexRiskClient {
  constructor(
    private readonly config: AppConfig,
    private readonly backend: ValidatorSignerBackend,
    private readonly httpClient: AxiosInstance = axios.create({ timeout: 10_000 }),
    private logger?: CexRiskLogger,
  ) {}

  setLogger(logger: CexRiskLogger): void {
    this.logger = logger;
  }

  /**
   * Hit CEX /verify for a single relayer-withdraw requestId. The endpoint
   * is GET with `requestId` as a query parameter (e.g.
   * `GET /api/relayer/withdraw/verify?requestId=123`). The signed
   * message is built over `{ requestId }` so the verifier can rebuild
   * the same canonical string regardless of transport. Throws on
   * transport / parse failure so the caller can deny-by-default.
   */
  async checkSingleWithdrawRisk(requestId: string): Promise<CexVerifyResult> {
    const url = `${this.config.cexApiUrl.replace(/\/$/, '')}${VERIFY_PATH}`;
    const signedPayload = { requestId };
    const headers = await this.buildSignedHeaders(signedPayload);
    const params = { requestId };

    // Use Axios's own query serializer so the diagnostic URL exactly matches
    // the request below, including escaping of the requestId query parameter.
    const requestUrl = axios.getUri({ url, params });
    this.logger?.info({ url: requestUrl }, 'CEX risk verify request');

    let response;
    try {
      response = await this.httpClient.request<CexVerifyResponse>({
        url,
        method: 'GET',
        headers,
        params,
      });
    } catch (error) {
      const detail = isAxiosError(error) ? error.message : String(error);
      throw new Error(`CEX verify request failed: ${detail}`);
    }

    if (response.status !== 200) {
      throw new Error(`CEX verify returned status ${response.status}`);
    }

    const raw = response.data;
    if (!raw || typeof raw !== 'object' || typeof raw.code !== 'number') {
      throw new Error('CEX verify returned an unexpected response shape');
    }
    if (raw.code !== 0) {
      throw new Error(`CEX verify returned code=${raw.code} msg=${raw.msg ?? ''}`);
    }
    if (raw.data !== true && raw.data !== false) {
      throw new Error('CEX verify returned non-boolean data');
    }

    return {
      allowed: raw.data === true,
      raw,
    };
  }

  async buildSignedHeaders(data: Record<string, unknown>): Promise<Record<string, string>> {
    const timestamp = Date.now();
    const nonce = randomUUID();
    const message = buildSignedMessage(data, timestamp, nonce);
    const signature = await this.backend.signRaw(message);

    return {
      'content-type': 'application/json',
      'x-signature': signature,
      'x-timestamp': String(timestamp),
      'x-nonce': nonce,
    };
  }

  getHttpClient(): AxiosInstance {
    return this.httpClient;
  }
}
