export type CollectionStatus = 'collecting' | 'executing' | 'executed' | 'rejected' | 'failed'
export type VoteDecision = 'signed' | 'rejected' | null

export interface CollectionValidator {
  validatorAddress: string
  validatorPower: string
  decision: VoteDecision
  submittedAt: string | null
}

export interface CollectionPayload {
  action: string
  chainId: number
  vaultAddress: string
  tokenAddress: string
  amount: string
  receiver: string
  nonce: string
}

export interface SignatureCollection {
  id: number
  actionType: string
  status: CollectionStatus
  chainId: number
  vaultAddress: string
  payload: CollectionPayload
  digest: string
  requiredPower: string
  collectedPower: string
  respondedValidatorCount: number
  totalValidatorCount: number
  executeTxHash: string | null
  failureCode: string | null
  failureMessage: string | null
  validators: CollectionValidator[]
}

export interface CollectionFilters {
  page?: number
  pageSize?: number
  status?: CollectionStatus
  actionType?: string
}
