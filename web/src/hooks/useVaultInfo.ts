import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, type Address, parseAbi } from 'viem'
import { useChainStore } from '../stores/chain'
import { getRpcUrl } from '../config/chains'
import { fetchVaultRoles } from '../api/admin/vault-state'

const vaultAbi = parseAbi([
  'function paused() view returns (bool)',
  'function pendingWithdrawChallengePeriod() view returns (uint256)',
  'function rebalanceReceiver() view returns (address)',
  'function validatorRequiredPowers(bytes32) view returns (uint256)',
])

export interface RoleHolder {
  name: string
  roleHash: string
  holders: string[]
}

export interface VaultInfo {
  paused: boolean
  challengePeriod: number
  rebalanceReceiver: string
  roles: RoleHolder[]
}

export interface VaultBasics {
  paused: boolean
  challengePeriod: number
  rebalanceReceiver: string
}

function createVaultRead(rpcUrl: string, vaultAddress: Address) {
  const client = createPublicClient({ transport: http(rpcUrl) })
  const read = <T,>(functionName: string, args?: unknown[]) =>
    client.readContract({ address: vaultAddress, abi: vaultAbi, functionName, args } as Parameters<typeof client.readContract>[0]) as Promise<T>
  return { client, read }
}

async function readVaultBasics(read: ReturnType<typeof createVaultRead>['read']): Promise<VaultBasics> {
  const [paused, challengePeriod, rebalanceReceiver] = await Promise.all([
    read<boolean>('paused'),
    read<bigint>('pendingWithdrawChallengePeriod'),
    read<string>('rebalanceReceiver'),
  ])

  return {
    paused,
    challengePeriod: Number(challengePeriod),
    rebalanceReceiver,
  }
}

async function fetchVaultBasics(rpcUrl: string, vaultAddress: Address): Promise<VaultBasics> {
  const { read } = createVaultRead(rpcUrl, vaultAddress)
  return readVaultBasics(read)
}

export function useVaultBasics() {
  const chain = useChainStore((s) => s.getCurrentChain())
  const rpcUrl = getRpcUrl(chain.chainId)
  const vaultAddress = chain.vaultAddress as Address

  return useQuery({
    queryKey: ['vaultBasics', chain.chainId],
    queryFn: () => fetchVaultBasics(rpcUrl, vaultAddress),
    enabled: !!chain.vaultAddress,
    staleTime: 5 * 60 * 1000,
  })
}

export function useVaultInfo() {
  const chain = useChainStore((s) => s.getCurrentChain())
  const rpcUrl = getRpcUrl(chain.chainId)
  const vaultAddress = chain.vaultAddress as Address

  return useQuery({
    queryKey: ['vaultInfo', chain.chainId],
    queryFn: async (): Promise<VaultInfo> => {
      const { read } = createVaultRead(rpcUrl, vaultAddress)
      const [basics, roleData] = await Promise.all([
        readVaultBasics(read),
        fetchVaultRoles(chain.chainId),
      ])
      if (
        roleData.chainId !== chain.chainId
        || roleData.vaultAddress.toLowerCase() !== chain.vaultAddress.toLowerCase()
      ) {
        throw new Error(`Relayer role source does not match configured chain ${chain.chainId}`)
      }

      return {
        ...basics,
        roles: roleData.roles,
      }
    },
    enabled: !!chain.vaultAddress,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRequiredPower(validatorSetHash: string | undefined, indexedRequiredPower?: string) {
  const chain = useChainStore((s) => s.getCurrentChain())
  const rpcUrl = getRpcUrl(chain.chainId)
  const vaultAddress = chain.vaultAddress as Address

  const query = useQuery({
    queryKey: ['requiredPower', chain.chainId, validatorSetHash],
    queryFn: async () => {
      const client = createPublicClient({ transport: http(rpcUrl) })
      const result = await client.readContract({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: 'validatorRequiredPowers',
        args: [validatorSetHash as `0x${string}`],
      })
      return Number(result)
    },
    enabled: indexedRequiredPower === undefined && !!validatorSetHash && !!chain.vaultAddress,
    staleTime: 5 * 60 * 1000,
  })
  return indexedRequiredPower === undefined
    ? query
    : { ...query, data: Number(indexedRequiredPower), isLoading: false }
}
