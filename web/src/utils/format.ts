import { formatUnits } from 'viem'
import type { TokenMeta } from '../hooks/useTokenMeta'

function groupIntegerPart(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatDecimalString(value: string): string {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return value
  }

  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [rawInt, rawDec = ''] = unsigned.split('.')
  const intPart = rawInt.replace(/^0+(?=\d)/, '') || '0'
  const decPart = rawDec.replace(/0+$/, '')
  const isZero = intPart === '0' && !decPart
  if (isZero) return '0'

  const sign = negative ? '-' : ''
  const grouped = groupIntegerPart(intPart)
  return decPart ? `${sign}${grouped}.${decPart}` : `${sign}${grouped}`
}

export function formatTokenAmount(
  rawAmount: string | bigint,
  tokenMeta: TokenMeta | undefined,
): string {
  const decimals = tokenMeta?.decimals ?? 18
  try {
    const value = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount)
    const formatted = formatUnits(value, decimals)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num > 0 && num < 0.0000000001) return '<0.0000000001'
    // Show full precision: strip trailing zeros from the formatted string
    const parts = formatted.split('.')
    if (parts.length === 1) return Number(parts[0]).toLocaleString()
    const intPart = Number(parts[0]).toLocaleString()
    const decPart = parts[1].replace(/0+$/, '')
    if (!decPart) return intPart
    return `${intPart}.${decPart}`
  } catch {
    return String(rawAmount)
  }
}

export function formatDecimalAmount(rawAmount: string | number): string {
  const value = String(rawAmount)
  const formatted = formatDecimalString(value)
  if (formatted !== value || /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const numeric = Number(value)
    if (numeric === 0) return '0'
    if (numeric > 0 && numeric < 0.0000000001) return '<0.0000000001'
    return formatted
  }
  return value
}

/** hardCapRatioBps * balance / 10000, BigInt precision */
export function calcHardCap(balance: string, hardCapRatioBps: string): bigint {
  return BigInt(hardCapRatioBps) * BigInt(balance) / 10000n
}

/** hardCap * refillRateMps / 1_000_000, BigInt precision (mul first, div second) */
export function calcRefillRate(hardCap: bigint, refillRateMps: string): bigint {
  return hardCap * BigInt(refillRateMps) / 1_000_000n
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function isNativeToken(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS
}

export function isZeroAddress(address: string | null | undefined): boolean {
  return !address || address.toLowerCase() === ZERO_ADDRESS
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatUnixSeconds(value: string | number): string | null {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleString()
}
