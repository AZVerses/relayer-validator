import { fetchSupportedTokens } from '../api/admin/vault-state'
import { getGraphClient } from '../api/graph/client'
import { GET_TOKENS, type GraphToken } from '../api/graph/queries'
import type { ChainConfig } from '../types/chain'

type TokenSourceDependencies = {
  fetchGraph: (graphUrl: string) => Promise<GraphToken[]>
  fetchRelayer: typeof fetchSupportedTokens
}

const defaultDependencies: TokenSourceDependencies = {
  fetchGraph: async (graphUrl) => {
    const client = getGraphClient(graphUrl)
    const data = await client.request<{ tokens: GraphToken[] }>(GET_TOKENS)
    return data.tokens
  },
  fetchRelayer: fetchSupportedTokens,
}

export async function loadTokens(
  chain: ChainConfig,
  dependencies: TokenSourceDependencies = defaultDependencies,
): Promise<GraphToken[]> {
  if (chain.graphUrl) {
    return dependencies.fetchGraph(chain.graphUrl)
  }

  const data = await dependencies.fetchRelayer(chain.chainId)
  if (data.chainId !== chain.chainId || data.vaultAddress.toLowerCase() !== chain.vaultAddress.toLowerCase()) {
    throw new Error(`Relayer token source does not match configured chain ${chain.chainId}`)
  }
  return data.tokens
}
