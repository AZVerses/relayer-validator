import { adminGet } from '../client'
import {
  generateNonce,
  signAndForwardRebalanceCollect,
  signAndForwardRebalanceCreate,
  signAndForwardRebalanceReject,
  type RebalanceWithdrawSignRequest,
} from '../local/sign'
import { getValidatorServiceBase } from '../../config/chains'
import { useChainStore } from '../../stores/chain'
import { buildRebalanceCollectSignRequest } from '../../utils/rebalance'
import type { PaginatedData } from '../../types/api'
import type { CollectionPayload, SignatureCollection, CollectionFilters } from '../../types/rebalance'

export function fetchCollections(chainId: number, filters: CollectionFilters) {
  return adminGet<PaginatedData<SignatureCollection>>(
    chainId,
    '/api/signature-collections',
    filters as Record<string, unknown>,
  )
}

export function fetchActiveCollection(chainId: number) {
  return adminGet<SignatureCollection | null>(chainId, '/api/signature-collections/active')
}

export function fetchCollectionById(chainId: number, id: number) {
  return adminGet<SignatureCollection>(chainId, `/api/signature-collections/${id}`)
}

function vaultAddressFor(chainId: number): string {
  const chain = useChainStore.getState().chains.find(c => c.chainId === chainId)
  if (!chain) {
    throw new Error(`chain ${chainId} not configured`)
  }
  return chain.vaultAddress
}

function buildRebalanceSignRequest(
  chainId: number,
  params: { tokenAddress: string; amount: string; receiver: string; nonce?: string },
): RebalanceWithdrawSignRequest {
  return {
    action: 'rebalance-withdraw',
    chainId,
    vaultAddress: vaultAddressFor(chainId),
    tokenAddress: params.tokenAddress,
    amount: params.amount,
    receiver: params.receiver,
    nonce: params.nonce ?? generateNonce(),
  }
}

/**
 * Create a new rebalance collection. The caller must supply the receiver
 * address (read from the vault contract) so the digest signed locally
 * matches what the relayer will recompute.
 */
export function createRebalanceCollection(
  chainId: number,
  params: { tokenAddress: string; amount: string; receiver: string },
) {
  return signAndForwardRebalanceCreate(
    getValidatorServiceBase(),
    buildRebalanceSignRequest(chainId, params),
  )
}

/**
 * Sign and submit a collect vote for an existing collection. Caller passes
 * the existing collection's payload so the digest matches exactly.
 */
export function collectSignature(id: number, payload: CollectionPayload) {
  return signAndForwardRebalanceCollect(
    getValidatorServiceBase(),
    buildRebalanceCollectSignRequest(payload),
    id,
  )
}

export function rejectCollection(id: number, payload: CollectionPayload) {
  return signAndForwardRebalanceReject(getValidatorServiceBase(), {
    collectionId: id,
    chainId: payload.chainId,
    vaultAddress: payload.vaultAddress,
  })
}
