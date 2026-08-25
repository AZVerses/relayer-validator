import { getGraphClient } from '../api/graph/client'
import { GET_VALIDATORS, type GraphValidator } from '../api/graph/queries'
import { fetchValidatorSets } from '../api/admin/vault-state'
import type { ChainConfig } from '../types/chain'

type ValidatorSourceDependencies = {
  fetchGraph: (graphUrl: string) => Promise<GraphValidator[]>
  fetchRelayer: typeof fetchValidatorSets
}

const defaultDependencies: ValidatorSourceDependencies = {
  fetchGraph: async (graphUrl) => {
    const client = getGraphClient(graphUrl)
    const data = await client.request<{ validators: GraphValidator[] }>(GET_VALIDATORS)
    return data.validators
  },
  fetchRelayer: fetchValidatorSets,
}

export async function loadValidators(
  chain: ChainConfig,
  dependencies: ValidatorSourceDependencies = defaultDependencies,
): Promise<GraphValidator[]> {
  if (chain.graphUrl) {
    return dependencies.fetchGraph(chain.graphUrl)
  }

  const data = await dependencies.fetchRelayer(chain.chainId)
  if (data.chainId !== chain.chainId || data.vaultAddress.toLowerCase() !== chain.vaultAddress.toLowerCase()) {
    throw new Error(`Relayer validator-set source does not match configured chain ${chain.chainId}`)
  }
  return data.sets.flatMap(set => set.validators.map(validator => ({
    id: `${set.hash}-${validator.address}`,
    address: validator.address,
    chainId: String(data.chainId),
    power: validator.power,
    validatorSetHash: set.hash,
    requiredPower: set.requiredPower,
  })))
}
