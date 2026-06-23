import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { mergeChainConfigs, parseChainConfigOverrides } from './src/config/chain-registry'

interface ChainEnv {
  chainId: number
  relayerUrl: string
  rpcUrl: string
  validatorServiceUrl: string
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const chains: ChainEnv[] = env.CHAIN_CONFIGS
    ? mergeChainConfigs(parseChainConfigOverrides(env.CHAIN_CONFIGS))
    : []

  const proxy: Record<string, object> = {}
  for (const chain of chains) {
    // Admin API proxy → relayer
    proxy[`/api/chain/${chain.chainId}`] = {
      target: chain.relayerUrl,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(`/api/chain/${chain.chainId}`, ''),
    }
    // Local validator service proxy
    proxy[`/validator-svc/chain/${chain.chainId}`] = {
      target: chain.validatorServiceUrl,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(`/validator-svc/chain/${chain.chainId}`, ''),
    }
    // RPC proxy (avoid browser CORS)
    proxy[`/rpc/chain/${chain.chainId}`] = {
      target: chain.rpcUrl,
      changeOrigin: true,
      rewrite: () => '/',
    }
  }

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'CHAIN_CONFIGS'],
    server: {
      port: 5173,
      proxy,
    },
  }
})
