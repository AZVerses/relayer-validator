import { adminGet } from '../client'
import {
  generateNonce,
  signAndForwardValidatorAction,
} from '../local/sign'
import { getValidatorServiceBase } from '../../config/chains'
import { useChainStore } from '../../stores/chain'
import type { PaginatedData } from '../../types/api'
import type { Withdrawal, WithdrawalFilters } from '../../types/withdrawal'

export function fetchWithdrawals(chainId: number, filters: WithdrawalFilters) {
  return adminGet<PaginatedData<Withdrawal>>(chainId, '/api/public/withdraws', filters as Record<string, unknown>)
}

function vaultAddressFor(chainId: number): string {
  const chain = useChainStore.getState().chains.find(c => c.chainId === chainId)
  if (!chain) {
    throw new Error(`chain ${chainId} not configured`)
  }
  return chain.vaultAddress
}

export function flushWithdrawals(chainId: number, requestIds: string[]) {
  return signAndForwardValidatorAction(getValidatorServiceBase(chainId), {
    action: 'batch-flush-withdrawals',
    chainId,
    vaultAddress: vaultAddressFor(chainId),
    withdrawalIds: requestIds,
    nonce: generateNonce(),
  })
}

export function pauseWithdrawal(chainId: number, requestId: string) {
  return signAndForwardValidatorAction(getValidatorServiceBase(chainId), {
    action: 'batch-toggle-pending-withdrawal',
    chainId,
    vaultAddress: vaultAddressFor(chainId),
    withdrawalIds: [requestId],
    shouldPause: true,
    nonce: generateNonce(),
  })
}

export function unpauseWithdrawal(chainId: number, requestId: string) {
  return signAndForwardValidatorAction(getValidatorServiceBase(chainId), {
    action: 'batch-toggle-pending-withdrawal',
    chainId,
    vaultAddress: vaultAddressFor(chainId),
    withdrawalIds: [requestId],
    shouldPause: false,
    nonce: generateNonce(),
  })
}

export function executeWithdrawal(chainId: number, requestId: string) {
  return signAndForwardValidatorAction(getValidatorServiceBase(chainId), {
    action: 'execute-pending-withdrawal',
    chainId,
    vaultAddress: vaultAddressFor(chainId),
    withdrawalId: requestId,
    nonce: generateNonce(),
  })
}

export function resetHotAmount(chainId: number, tokenAddresses: string[]) {
  return signAndForwardValidatorAction(getValidatorServiceBase(chainId), {
    action: 'batch-reset-withdraw-hot-amount',
    chainId,
    vaultAddress: vaultAddressFor(chainId),
    tokenAddresses,
    nonce: generateNonce(),
  })
}
