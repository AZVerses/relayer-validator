import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, erc20Abi, type Address } from 'viem'
import { useChainStore } from '../stores/chain'
import { useTokens } from './useGraphData'
import { isNativeToken } from '../utils/format'
import { getRpcUrl } from '../config/chains'

export interface TokenMeta {
  address: string
  name: string
  symbol: string
  decimals: number
}

async function fetchTokenMeta(rpcUrl: string, tokenAddress: string): Promise<TokenMeta | null> {
  if (isNativeToken(tokenAddress)) {
    return { address: tokenAddress.toLowerCase(), name: 'ETH', symbol: 'ETH', decimals: 18 }
  }
  try {
    const client = createPublicClient({ transport: http(rpcUrl) })
    const addr = tokenAddress as Address

    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: addr, abi: erc20Abi, functionName: 'name' }),
      client.readContract({ address: addr, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: addr, abi: erc20Abi, functionName: 'decimals' }),
    ])

    return { address: tokenAddress.toLowerCase(), name, symbol, decimals }
  } catch (e) {
    console.error(`Failed to fetch token meta for ${tokenAddress}:`, e)
    return null
  }
}

export function useTokenMetaMap() {
  const chain = useChainStore((s) => s.getCurrentChain())
  const { data: tokens } = useTokens()

  const tokenAddresses = tokens?.map((t) => t.token.toLowerCase()).sort().join(',') ?? ''

  const rpcUrl = getRpcUrl(chain.chainId)

  return useQuery({
    queryKey: ['tokenMeta', chain.chainId, tokenAddresses],
    queryFn: async () => {
      if (!tokens?.length) return new Map<string, TokenMeta>()

      const results = await Promise.allSettled(
        tokens.map((t) => fetchTokenMeta(rpcUrl, t.token)),
      )

      const map = new Map<string, TokenMeta>()
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          map.set(result.value.address, result.value)
        }
      }
      return map
    },
    enabled: !!tokens?.length,
    staleTime: 5 * 60 * 1000,
  })
}
