import type { RebalanceWithdrawSignRequest } from '../api/local/sign'
import type { CollectionPayload } from '../types/rebalance'

export function buildRebalanceCollectSignRequest(
  payload: CollectionPayload,
): RebalanceWithdrawSignRequest {
  return {
    action: 'rebalance-withdraw',
    chainId: payload.chainId,
    vaultAddress: payload.vaultAddress,
    tokenAddress: payload.tokenAddress,
    amount: payload.amount,
    receiver: payload.receiver,
    nonce: payload.nonce,
  }
}
