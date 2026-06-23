import { gql } from 'graphql-request'

export interface GraphToken {
  id: string
  token: string
  hardCapRatioBps: string
  refillRateMps: string
  lastRefillTimestamp: string
  usedWithdrawHotAmount: string
  balance: string
}

export interface GraphValidator {
  id: string
  address: string
  chainId: string
  power: string
  validatorSetHash: string
}

export const GET_TOKENS = gql`
  query GetTokens {
    tokens {
      id
      token
      hardCapRatioBps
      refillRateMps
      lastRefillTimestamp
      usedWithdrawHotAmount
      balance
    }
  }
`

export const GET_VALIDATORS = gql`
  query GetValidators {
    validators(first: 1000) {
      id
      address
      chainId
      power
      validatorSetHash
    }
  }
`
