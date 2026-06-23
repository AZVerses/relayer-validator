import { ethers } from 'ethers';
import { SignRequest } from '../../types/actions';

function encodeAndHash(types: string[], values: unknown[]): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(types, values));
}

export function buildDigest(request: SignRequest): string {
  const chainId = BigInt(request.chainId);

  switch (request.action) {
    case 'request-withdraw':
      return encodeAndHash(
        ['string', 'uint256', 'uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bool', 'uint256'],
        [
          'requestWithdraw',
          BigInt(request.withdrawalId),
          chainId,
          request.vaultAddress,
          request.tokenAddress,
          BigInt(request.amount),
          BigInt(request.fee),
          request.receiver,
          request.isForcePending,
          BigInt(request.nonce),
        ],
      );
    case 'batch-flush-withdrawals':
      return encodeAndHash(
        ['string', 'uint256[]', 'uint256', 'address', 'uint256'],
        [
          'batchFlushWithdrawals',
          request.withdrawalIds.map((id: string) => BigInt(id)),
          chainId,
          request.vaultAddress,
          BigInt(request.nonce),
        ],
      );
    case 'batch-toggle-pending-withdrawal':
      return encodeAndHash(
        ['string', 'uint256[]', 'uint256', 'address', 'bool', 'uint256'],
        [
          'batchTogglePendingWithdrawal',
          request.withdrawalIds.map((id: string) => BigInt(id)),
          chainId,
          request.vaultAddress,
          request.shouldPause,
          BigInt(request.nonce),
        ],
      );
    case 'execute-pending-withdrawal':
      return encodeAndHash(
        ['string', 'uint256', 'uint256', 'address', 'uint256'],
        [
          'executePendingWithdrawal',
          BigInt(request.withdrawalId),
          chainId,
          request.vaultAddress,
          BigInt(request.nonce),
        ],
      );
    case 'batch-reset-withdraw-hot-amount':
      return encodeAndHash(
        ['string', 'address[]', 'uint256', 'address', 'uint256'],
        [
          'batchResetWithdrawHotAmount',
          request.tokenAddresses,
          chainId,
          request.vaultAddress,
          BigInt(request.nonce),
        ],
      );
    case 'rebalance-withdraw':
      return encodeAndHash(
        ['string', 'uint256', 'address', 'address', 'uint256', 'address', 'uint256'],
        [
          'rebalanceWithdraw',
          chainId,
          request.vaultAddress,
          request.tokenAddress,
          BigInt(request.amount),
          request.receiver,
          BigInt(request.nonce),
        ],
      );
    case 'reject-rebalance-collection':
      return encodeAndHash(
        ['string', 'uint256', 'address', 'uint256'],
        [
          'rejectRebalanceCollection',
          chainId,
          request.vaultAddress,
          BigInt(request.collectionId),
        ],
      );
  }

  const unsupportedAction: never = request;
  throw new Error(`Unsupported action: ${JSON.stringify(unsupportedAction)}`);
}
