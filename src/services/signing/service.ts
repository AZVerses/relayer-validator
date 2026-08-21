import { AppConfig } from '../../config';
import { RiskCheckError, riskCheck } from '../risk-check';
import { buildDigest } from './digests';
import { SignedPayload, SignRequest } from '../../types/actions';
import { ValidatorSignerBackend } from '../kms/backend';
import { CexRiskClient, CexRiskLogger } from '../cex/client';

export interface ValidatorInfo {
  address: string;
}

export class SigningService {
  private validatorCache: ValidatorInfo | null = null;
  private readonly cexRiskClient: CexRiskClient;

  constructor(
    private readonly config: AppConfig,
    private readonly backend: ValidatorSignerBackend,
    cexRiskClient?: CexRiskClient,
  ) {
    this.cexRiskClient = cexRiskClient ?? new CexRiskClient(config, backend);
  }

  setLogger(logger: CexRiskLogger): void {
    this.cexRiskClient.setLogger(logger);
  }

  async getValidator(): Promise<ValidatorInfo> {
    if (this.validatorCache) {
      return this.validatorCache;
    }

    this.validatorCache = {
      address: await this.backend.getValidatorAddress(),
    };
    return this.validatorCache;
  }

  async sign(request: SignRequest): Promise<SignedPayload> {
    // Reject is a defensive, validator-local action — it carries no funds and
    // does not need CEX risk approval.
    const skipRiskCheck = request.action === 'reject-rebalance-collection';

    let risk: SignedPayload['riskCheck'];
    if (skipRiskCheck) {
      risk = {
        allowed: true,
        reason: 'reject-skip-risk-check',
        tags: ['skip'],
        checkedAt: new Date().toISOString(),
      };
    } else {
      try {
        risk = await riskCheck(request, this.cexRiskClient);
      } catch (error) {
        throw new RiskCheckError(
          `Risk check failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (!risk.allowed) {
        throw new RiskCheckError(`Risk check denied signing: ${risk.reason}`);
      }
    }

    const validator = await this.getValidator();
    const digest = buildDigest(request);
    const signature = await this.backend.signDigest(digest);

    return {
      action: request.action,
      chainId: request.chainId,
      vaultAddress: request.vaultAddress,
      digest,
      validatorAddress: validator.address,
      signature,
      signedAt: new Date().toISOString(),
      riskCheck: risk,
    };
  }
}
