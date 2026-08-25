import type { ChainConfig } from '../types/chain'

export const ARBITRUM_ONE_CHAIN_ID = 42161

type ChainIdentity = Pick<ChainConfig, 'chainId'>

export function resolveSelectedChainId(
  chains: readonly ChainIdentity[],
  rawChainId: string | null,
): number {
  if (chains.length === 0) {
    throw new Error('At least one chain must be configured')
  }

  if (rawChainId !== null && /^\d+$/.test(rawChainId)) {
    const parsed = Number(rawChainId)
    if (Number.isSafeInteger(parsed) && chains.some((chain) => chain.chainId === parsed)) {
      return parsed
    }
  }

  return chains.find((chain) => chain.chainId === ARBITRUM_ONE_CHAIN_ID)?.chainId
    ?? chains[0].chainId
}
