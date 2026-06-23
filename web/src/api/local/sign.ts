import { localPost } from './client'

export interface RebalanceWithdrawSignRequest {
  action: 'rebalance-withdraw'
  chainId: number
  vaultAddress: string
  tokenAddress: string
  amount: string
  receiver: string
  nonce: string
}

export interface BatchFlushSignRequest {
  action: 'batch-flush-withdrawals'
  chainId: number
  vaultAddress: string
  withdrawalIds: string[]
  nonce: string
}

export interface BatchToggleSignRequest {
  action: 'batch-toggle-pending-withdrawal'
  chainId: number
  vaultAddress: string
  withdrawalIds: string[]
  shouldPause: boolean
  nonce: string
}

export interface ExecutePendingSignRequest {
  action: 'execute-pending-withdrawal'
  chainId: number
  vaultAddress: string
  withdrawalId: string
  nonce: string
}

export interface BatchResetHotAmountSignRequest {
  action: 'batch-reset-withdraw-hot-amount'
  chainId: number
  vaultAddress: string
  tokenAddresses: string[]
  nonce: string
}

export type ValidatorActionSignRequest =
  | BatchFlushSignRequest
  | BatchToggleSignRequest
  | ExecutePendingSignRequest
  | BatchResetHotAmountSignRequest

export type SignWithdrawOperationRequest = ValidatorActionSignRequest | RebalanceWithdrawSignRequest

/**
 * Generate a random uint256 nonce as a decimal string.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let hex = '0x'
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0')
  }
  return BigInt(hex).toString()
}

export async function signAndForwardValidatorAction(
  baseUrl: string,
  request: ValidatorActionSignRequest,
) {
  return localPost<unknown>(baseUrl, '/admin/sign-withdraw-operation', { request })
}

export async function signAndForwardRebalanceCreate(
  baseUrl: string,
  request: RebalanceWithdrawSignRequest,
) {
  return localPost<unknown>(baseUrl, '/admin/sign-withdraw-operation', { request })
}

export async function signAndForwardRebalanceCollect(
  baseUrl: string,
  request: RebalanceWithdrawSignRequest,
  collectionId: number,
) {
  return localPost<unknown>(baseUrl, '/admin/sign-withdraw-operation', { request, collectionId })
}

export async function signAndForwardRebalanceReject(
  baseUrl: string,
  envelope: { collectionId: number; chainId: number; vaultAddress: string },
) {
  return localPost<unknown>(baseUrl, '/admin/sign-rebalance-reject', envelope)
}
