import { adminGet } from '../client'
import type { PaginatedData } from '../../types/api'
import type { Deposit, DepositFilters } from '../../types/deposit'

export function fetchDeposits(chainId: number, filters: DepositFilters) {
  return adminGet<PaginatedData<Deposit>>(chainId, '/api/public/deposits', filters as Record<string, unknown>)
}
