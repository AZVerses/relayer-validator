import type { Withdrawal } from '../types/withdrawal'

export interface RowActionFlags {
  isAlive: boolean
  isExpired: boolean
  canPause: boolean
  canUnpause: boolean
  canFlush: boolean
  canExecute: boolean
}

export function deriveWithdrawalActionFlags(
  record: Withdrawal,
  challengePeriodSeconds?: number,
  nowSeconds = Date.now() / 1000,
): RowActionFlags {
  const isAlive = record.isPending && !record.isExecuted && !record.isFlushed
  const ts = Number(record.timestamp)
  const isExpired =
    !!challengePeriodSeconds && ts > 0 && nowSeconds > ts + challengePeriodSeconds

  return {
    isAlive,
    isExpired,
    canPause: isAlive && !record.isPaused && !isExpired,
    canUnpause: isAlive && record.isPaused,
    canFlush: isAlive && !record.isPaused && !isExpired,
    canExecute: isAlive && !record.isPaused && isExpired,
  }
}
