export interface Deposit {
  requestId: string
  timestamp: string
  tokenAddress: string
  chainId: number
  transactionHash: string
  fromAddress: string
  toAddress: string
  transactionTime: number
  confirmNumber: number
  amount: string
  transactionStatus: 'unconfirmed' | 'confirming' | 'confirmed'
}

export interface DepositFilters {
  page?: number
  pageSize?: number
  user?: string
  tokenAddress?: string
  startTimestamp?: number
  endTimestamp?: number
}
