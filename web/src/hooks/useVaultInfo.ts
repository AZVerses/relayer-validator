import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, type Address, parseAbi, parseAbiItem } from 'viem'
import { useChainStore } from '../stores/chain'
import { getRpcUrl } from '../config/chains'

const vaultAbi = parseAbi([
  'function paused() view returns (bool)',
  'function pendingWithdrawChallengePeriod() view returns (uint256)',
  'function rebalanceReceiver() view returns (address)',
  'function validatorRequiredPowers(bytes32) view returns (uint256)',
  'function ADMIN_ROLE() view returns (bytes32)',
  'function OPERATOR_ROLE() view returns (bytes32)',
  'function PAUSE_ROLE() view returns (bytes32)',
  'function TOKEN_ROLE() view returns (bytes32)',
  'function VALIDATOR_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
])

const roleGrantedEvent = parseAbiItem('event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)')
const roleRevokedEvent = parseAbiItem('event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)')

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
      const { client, read } = createVaultRead(rpcUrl, vaultAddress)
      const [basics, ...roleHashes] = await Promise.all([
        readVaultBasics(read),
        read<`0x${string}`>('ADMIN_ROLE'),
        read<`0x${string}`>('OPERATOR_ROLE'),
        read<`0x${string}`>('PAUSE_ROLE'),
        read<`0x${string}`>('TOKEN_ROLE'),
        read<`0x${string}`>('VALIDATOR_ROLE'),
      ])
      const roleNames = ['ADMIN_ROLE', 'OPERATOR_ROLE', 'PAUSE_ROLE', 'TOKEN_ROLE', 'VALIDATOR_ROLE']
      const fromBlock = BigInt(chain.startBlock)

      // Scan RoleGranted / RoleRevoked events to find current holders
      const [grantedLogs, revokedLogs] = await Promise.all([
        client.getLogs({ address: vaultAddress, event: roleGrantedEvent, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: vaultAddress, event: roleRevokedEvent, fromBlock, toBlock: 'latest' }),
      ])

      const revokedSet = new Set(
        revokedLogs.map((l) => `${l.args.role}-${l.args.account?.toLowerCase()}`),
      )

      // Group granted addresses by role, excluding revoked
      const roleMap = new Map<string, Set<string>>()
      for (const log of grantedLogs) {
        const role = log.args.role
        const account = log.args.account?.toLowerCase()
        if (!role || !account) continue
        if (revokedSet.has(`${role}-${account}`)) continue
        const set = roleMap.get(role) ?? new Set()
        set.add(account)
        roleMap.set(role, set)
      }

      const roles: RoleHolder[] = roleNames.map((name, i) => ({
        name: name.replace('_ROLE', ''),
        roleHash: roleHashes[i],
        holders: Array.from(roleMap.get(roleHashes[i]) ?? []),
      }))

      return {
        ...basics,
        roles,
      }
    },
    enabled: !!chain.vaultAddress,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRequiredPower(validatorSetHash: string | undefined) {
  const chain = useChainStore((s) => s.getCurrentChain())
  const rpcUrl = getRpcUrl(chain.chainId)
  const vaultAddress = chain.vaultAddress as Address

  return useQuery({
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
    enabled: !!validatorSetHash && !!chain.vaultAddress,
    staleTime: 5 * 60 * 1000,
  })
}
