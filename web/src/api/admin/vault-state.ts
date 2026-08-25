import { adminGet } from '../client'

export interface RelayerRole {
  name: string
  roleHash: string
  holders: string[]
}

export interface RelayerValidatorSet {
  hash: string
  totalPower: string
  requiredPower: string
  validators: Array<{
    address: string
    power: string
  }>
}

export function fetchVaultRoles(chainId: number) {
  return adminGet<{
    chainId: number
    vaultAddress: string
    roles: RelayerRole[]
  }>(chainId, '/api/public/vault-roles')
}

export function fetchValidatorSets(chainId: number) {
  return adminGet<{
    chainId: number
    vaultAddress: string
    sets: RelayerValidatorSet[]
  }>(chainId, '/api/public/validator-sets')
}
