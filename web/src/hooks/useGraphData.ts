import { useQuery } from '@tanstack/react-query'
import { useChainStore } from '../stores/chain'
import { loadValidators } from '../data/validator-source'
import { loadTokens } from '../data/token-source'

export function useTokens() {
  const chain = useChainStore((s) => s.getCurrentChain())
  return useQuery({
    queryKey: ['tokens', chain.chainId],
    queryFn: () => loadTokens(chain),
  })
}

export function useValidators() {
  const chain = useChainStore((s) => s.getCurrentChain())
  return useQuery({
    queryKey: ['validators', chain.chainId],
    queryFn: () => loadValidators(chain),
  })
}
