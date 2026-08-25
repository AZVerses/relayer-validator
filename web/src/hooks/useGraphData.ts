import { useQuery } from '@tanstack/react-query'
import { useChainStore } from '../stores/chain'
import { getGraphClient } from '../api/graph/client'
import { GET_TOKENS } from '../api/graph/queries'
import type { GraphToken } from '../api/graph/queries'
import { loadValidators } from '../data/validator-source'

export function useTokens() {
  const chain = useChainStore((s) => s.getCurrentChain())
  return useQuery({
    queryKey: ['tokens', chain.chainId],
    queryFn: async () => {
      if (!chain.graphUrl) return []
      const client = getGraphClient(chain.graphUrl)
      const data = await client.request<{ tokens: GraphToken[] }>(GET_TOKENS)
      return data.tokens
    },
  })
}

export function useValidators() {
  const chain = useChainStore((s) => s.getCurrentChain())
  return useQuery({
    queryKey: ['validators', chain.chainId],
    queryFn: () => loadValidators(chain),
  })
}
