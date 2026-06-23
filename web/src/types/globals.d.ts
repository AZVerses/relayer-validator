// Runtime config injected by /config.js at container start.
declare global {
  interface Window {
    __APP_CONFIG__?: {
      /** ChainConfigOverride[] — direct JS array, not stringified */
      CHAIN_CONFIGS?: unknown
    }
  }
}

export {}
