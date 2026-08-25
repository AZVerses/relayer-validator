import type { ChainConfig, ChainConfigOverride } from '../types/chain'

type BuiltInChainConfig = Omit<ChainConfig, 'graphUrl' | 'vaultAddress' | 'rpcUrl'> & { rpcUrl?: string }

const CHAIN_CONFIG_FIELDS = new Set([
  'chainId',
  'name',
  'vaultAddress',
  'graphUrl',
  'explorerUrl',
  'rpcUrl',
  'rpcUrls',
  'relayerUrl',
  'startBlock',
  'scanBlockBatchSize',
])

const BUILT_IN_CHAINS: BuiltInChainConfig[] = [
  {
    name: 'Arbitrum One',
    chainId: 42161,
    relayerUrl: 'http://localhost:3000',
    validatorServiceUrl: 'http://localhost:3001',
    explorerUrl: 'https://arbiscan.io',
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
  },
  {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    relayerUrl: 'http://localhost:3000',
    validatorServiceUrl: 'http://localhost:3001',
    explorerUrl: 'https://sepolia.arbiscan.io',
    rpcUrl: 'https://arbitrum-sepolia-rpc.publicnode.com',
  },
  {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    relayerUrl: 'http://localhost:3000',
    validatorServiceUrl: 'http://localhost:3001',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
]

function assertOptionalString(override: Record<string, unknown>, key: keyof ChainConfigOverride, index: number): void {
  const value = override[key]
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`CHAIN_CONFIGS[${index}].${key} must be a string`)
  }
}

function assertChainConfigOverride(value: unknown, index: number): asserts value is ChainConfigOverride {
  if (!value || typeof value !== 'object') {
    throw new Error(`CHAIN_CONFIGS[${index}] must be an object`)
  }

  const override = value as Record<string, unknown>
  for (const key of Object.keys(override)) {
    if (!CHAIN_CONFIG_FIELDS.has(key)) {
      throw new Error(`CHAIN_CONFIGS[${index}].${key} is not supported`)
    }
  }
  if (!Number.isInteger(override.chainId) || Number(override.chainId) <= 0) {
    throw new Error(`CHAIN_CONFIGS[${index}].chainId must be a positive integer`)
  }
  if (typeof override.vaultAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(override.vaultAddress)) {
    throw new Error(`CHAIN_CONFIGS[${index}].vaultAddress must be a 0x-prefixed address`)
  }
  if (typeof override.graphUrl !== 'string') {
    throw new Error(`CHAIN_CONFIGS[${index}].graphUrl must be a string`)
  }
  for (const key of ['name', 'explorerUrl', 'rpcUrl', 'relayerUrl'] as const) {
    assertOptionalString(override, key, index)
  }
}

export function normalizeChainConfigOverrides(value: unknown): ChainConfigOverride[] {
  if (!Array.isArray(value)) {
    throw new Error('CHAIN_CONFIGS must be a JSON array')
  }

  value.forEach(assertChainConfigOverride)
  return value
}

export function parseChainConfigOverrides(raw: string | undefined): ChainConfigOverride[] {
  if (!raw) return []
  return normalizeChainConfigOverrides(JSON.parse(raw))
}

export function mergeChainConfigs(overrides: ChainConfigOverride[]): ChainConfig[] {
  if (overrides.length === 0) {
    throw new Error('CHAIN_CONFIGS must contain at least one chain override')
  }

  const baseByChainId = new Map(BUILT_IN_CHAINS.map((chain) => [chain.chainId, chain]))

  return overrides.map((override) => {
    const base = baseByChainId.get(override.chainId)
    if (!base && !hasFullChainConfigOverride(override)) {
      throw new Error(`CHAIN_CONFIGS contains unsupported chainId ${override.chainId}; provide name, explorerUrl, rpcUrl, and relayerUrl to add a custom chain`)
    }
    if (!override.rpcUrl && !base?.rpcUrl) {
      throw new Error(`CHAIN_CONFIGS requires rpcUrl for chainId ${override.chainId}`)
    }

    return {
      ...(base ?? {
        name: override.name!,
        chainId: override.chainId,
        relayerUrl: override.relayerUrl!,
        validatorServiceUrl: 'http://localhost:3001',
        explorerUrl: override.explorerUrl!,
        rpcUrl: override.rpcUrl!,
      }),
      name: override.name ?? base?.name ?? override.name!,
      relayerUrl: override.relayerUrl ?? base?.relayerUrl ?? override.relayerUrl!,
      validatorServiceUrl: base?.validatorServiceUrl ?? 'http://localhost:3001',
      explorerUrl: override.explorerUrl ?? base?.explorerUrl ?? override.explorerUrl!,
      rpcUrl: override.rpcUrl ?? base!.rpcUrl!,
      graphUrl: override.graphUrl,
      vaultAddress: override.vaultAddress,
    }
  })
}

function hasFullChainConfigOverride(override: ChainConfigOverride): boolean {
  return Boolean(
    override.name &&
    override.explorerUrl &&
    override.rpcUrl &&
    override.relayerUrl,
  )
}
