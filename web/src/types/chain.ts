export interface ChainConfig {
  name: string
  chainId: number
  relayerUrl: string
  /**
   * Validator service base URL for this chain.
   * Admin web POSTs write operations (sign + forward) to this endpoint.
   */
  validatorServiceUrl: string
  graphUrl: string
  explorerUrl: string
  rpcUrl: string
  startBlock: number
  vaultAddress: string
}

export interface ChainConfigOverride {
  chainId: number
  graphUrl: string
  vaultAddress: string
  name?: string
  explorerUrl?: string
  rpcUrl?: string
  startBlock?: number
}
