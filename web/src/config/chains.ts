import type { ChainConfig } from '../types/chain'
import { mergeChainConfigs, normalizeChainConfigOverrides, parseChainConfigOverrides } from './chain-registry'

let _chains: ChainConfig[] | null = null

export function getChains(): ChainConfig[] {
  if (_chains) return _chains

  const runtimeOverrides = window.__APP_CONFIG__?.CHAIN_CONFIGS
  if (Array.isArray(runtimeOverrides) && runtimeOverrides.length > 0) {
    _chains = mergeChainConfigs(normalizeChainConfigOverrides(runtimeOverrides))
    return _chains
  }

  const rawOverrides = import.meta.env.CHAIN_CONFIGS
  if (rawOverrides) {
    _chains = mergeChainConfigs(parseChainConfigOverrides(rawOverrides))
    return _chains
  }

  throw new Error('CHAIN_CONFIGS is required to configure vaultAddress and graphUrl')
}

/**
 * Admin API base URL — always a same-origin path.
 * Dev: Vite proxy forwards to chain.relayerUrl.
 * Prod: nginx/validator service forwards to global RELAYER_URL.
 */
export function getApiBase(chainId: number): string {
  return `/api/chain/${chainId}`
}

/**
 * RPC URL — always a same-origin path. Same proxy logic as getApiBase.
 * Prod: nginx/validator service forwards by CHAIN_CONFIGS[].rpcUrl.
 */
export function getRpcUrl(chainId: number): string {
  return `/rpc/chain/${chainId}`
}

/**
 * Local validator service base URL — same-origin path.
 * Dev: Vite proxy forwards to chain.validatorServiceUrl.
 * Prod: nginx forwards to the current validator deployment.
 */
export function getValidatorServiceBase(chainId: number): string {
  return `/validator-svc/chain/${chainId}`
}
