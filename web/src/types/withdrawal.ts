export interface Withdrawal {
  withdrawId: string
  chainId: number
  lastEventType: string
  amount: string
  fee: string
  tokenAddress: string
  toAddress: string
  timestamp: string
  isPending: boolean
  isPaused: boolean
  isExecuted: boolean
  isFlushed: boolean
  isForcePending: boolean
  transactionHash: string
  blockNumber: number
  transactionStatus: 'unconfirmed' | 'confirming' | 'confirmed'
}

export interface WithdrawalFilters {
  page?: number
  pageSize?: number
  user?: string
  tokenAddress?: string
  startTimestamp?: number
  endTimestamp?: number
  isPending?: boolean
  isPaused?: boolean
}
