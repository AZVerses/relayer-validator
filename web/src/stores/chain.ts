import { create } from 'zustand'
import type { ChainConfig } from '../types/chain'
import { getChains } from '../config/chains'
import { resolveSelectedChainId } from '../utils/chain-selection'

interface ChainState {
  chains: ChainConfig[]
  selectedChainId: number
  selectChain: (chainId: number) => void
  getCurrentChain: () => ChainConfig
}

const chains = getChains()
const initialChainId = resolveSelectedChainId(
  chains,
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('chain'),
)

export const useChainStore = create<ChainState>((set, get) => ({
  chains,
  selectedChainId: initialChainId,
  selectChain: (chainId: number) => set({ selectedChainId: chainId }),
  getCurrentChain: () => {
    const { chains, selectedChainId } = get()
    const chain = chains.find((c) => c.chainId === selectedChainId)
    if (!chain) throw new Error(`Chain ${selectedChainId} not found`)
    return chain
  },
}))
