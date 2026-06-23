import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Expected EVM address');
const uintStringSchema = z.string().regex(/^\d+$/, 'Expected unsigned integer string');
const nonEmptyArray = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).min(1);

export const actionNameSchema = z.enum([
  'request-withdraw',
  'batch-flush-withdrawals',
  'batch-toggle-pending-withdrawal',
  'execute-pending-withdrawal',
  'batch-reset-withdraw-hot-amount',
  'rebalance-withdraw',
  'reject-rebalance-collection',
]);

const commonRequestSchema = z.object({
  action: actionNameSchema,
  chainId: z.number().int().positive(),
  vaultAddress: addressSchema,
});

export const requestWithdrawSchema = commonRequestSchema.extend({
  action: z.literal('request-withdraw'),
  withdrawalId: uintStringSchema,
  tokenAddress: addressSchema,
  amount: uintStringSchema,
  fee: uintStringSchema,
  receiver: addressSchema,
  isForcePending: z.boolean(),
  nonce: uintStringSchema,
});

export const batchFlushWithdrawalsSchema = commonRequestSchema.extend({
  action: z.literal('batch-flush-withdrawals'),
  withdrawalIds: nonEmptyArray(uintStringSchema),
  nonce: uintStringSchema,
});

export const batchTogglePendingWithdrawalSchema = commonRequestSchema.extend({
  action: z.literal('batch-toggle-pending-withdrawal'),
  withdrawalIds: nonEmptyArray(uintStringSchema),
  shouldPause: z.boolean(),
  nonce: uintStringSchema,
});

export const executePendingWithdrawalSchema = commonRequestSchema.extend({
  action: z.literal('execute-pending-withdrawal'),
  withdrawalId: uintStringSchema,
  nonce: uintStringSchema,
});

export const batchResetWithdrawHotAmountSchema = commonRequestSchema.extend({
  action: z.literal('batch-reset-withdraw-hot-amount'),
  tokenAddresses: nonEmptyArray(addressSchema),
  nonce: uintStringSchema,
});

export const rebalanceWithdrawSchema = commonRequestSchema.extend({
  action: z.literal('rebalance-withdraw'),
  tokenAddress: addressSchema,
  amount: uintStringSchema,
  receiver: addressSchema,
  nonce: uintStringSchema,
});

export const rejectRebalanceCollectionSchema = commonRequestSchema.extend({
  action: z.literal('reject-rebalance-collection'),
  collectionId: uintStringSchema,
});

export const signRequestSchema = z.discriminatedUnion('action', [
  requestWithdrawSchema,
  batchFlushWithdrawalsSchema,
  batchTogglePendingWithdrawalSchema,
  executePendingWithdrawalSchema,
  batchResetWithdrawHotAmountSchema,
  rebalanceWithdrawSchema,
  rejectRebalanceCollectionSchema,
]);

export type SignRequest = z.infer<typeof signRequestSchema>;
export type ActionName = z.infer<typeof actionNameSchema>;

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
  tags: string[];
  checkedAt: string;
}

export interface SignedPayload {
  action: ActionName;
  chainId: number;
  vaultAddress: string;
  digest: string;
  validatorAddress: string;
  signature: string;
  signedAt: string;
  riskCheck: RiskCheckResult;
}
