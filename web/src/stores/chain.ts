import { create } from 'zustand'
import type { ChainConfig } from '../types/chain'
import { getChains } from '../config/chains'

interface ChainState {
  chains: ChainConfig[]
  selectedChainId: number
  selectChain: (chainId: number) => void
  getCurrentChain: () => ChainConfig
}

const chains = getChains()

export const useChainStore = create<ChainState>((set, get) => ({
  chains,
  selectedChainId: chains[0].chainId,
  selectChain: (chainId: number) => set({ selectedChainId: chainId }),
  getCurrentChain: () => {
    const { chains, selectedChainId } = get()
    const chain = chains.find((c) => c.chainId === selectedChainId)
    if (!chain) throw new Error(`Chain ${selectedChainId} not found`)
    return chain
  },
}))
