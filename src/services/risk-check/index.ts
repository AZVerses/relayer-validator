import { RiskCheckResult, SignRequest } from '../../types/actions';
import { CexRiskClient } from '../cex/client';

export class RiskCheckError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'RiskCheckError';
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Map a SignRequest to the list of user-scoped requestIds that need a
 * CEX /verify roundtrip. Returns null for actions that have no
 * per-user requestId (operator-scope rebalance / hot-amount reset);
 * those bypass CEX with an explicit skip tag so the audit trail stays
 * intact. `reject-rebalance-collection` is skipped earlier by the
 * signing service.
 */
function requestIdsForAction(request: SignRequest): string[] | null {
  switch (request.action) {
    case 'request-withdraw':
    case 'execute-pending-withdrawal':
      return [request.withdrawalId];
    case 'batch-flush-withdrawals':
    case 'batch-toggle-pending-withdrawal':
      return request.withdrawalIds;
    case 'batch-reset-withdraw-hot-amount':
    case 'rebalance-withdraw':
    case 'reject-rebalance-collection':
      return null;
  }
}

export async function riskCheck(request: SignRequest, cexRiskClient: CexRiskClient): Promise<RiskCheckResult> {
  const checkedAt = new Date().toISOString();
  const ids = requestIdsForAction(request);
  if (ids === null) {
    return {
      allowed: true,
      reason: 'operator-action-no-user-verify',
      tags: ['skip-cex-verify', request.action],
      checkedAt,
    };
  }

  // Sequential: a single denial short-circuits and we attribute the
  // refusal to the specific requestId so operators can investigate
  // without re-running the whole batch.
  for (const requestId of ids) {
    const result = await cexRiskClient.checkSingleWithdrawRisk(requestId);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `cex-denied:${requestId}`,
        tags: ['cex-verify', request.action],
        checkedAt: new Date().toISOString(),
      };
    }
  }

  return {
    allowed: true,
    reason: 'cex-allowed',
    tags: ['cex-verify', request.action],
    checkedAt: new Date().toISOString(),
  };
}
