import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { TokenSymbol } from '../models/types.js';

const TOKEN_SYMBOLS: [TokenSymbol, ...TokenSymbol[]] = ['STRK', 'ETH', 'USDC', 'USDT', 'wBTC', 'lBTC', 'tBTC'];

// ─── Shared Zod Schemas ────────────────────────────────────────────────────────

export const amountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a positive decimal number')
  .refine((v) => parseFloat(v) > 0, 'Amount must be greater than 0');

export const tokenSchema = z.enum(TOKEN_SYMBOLS);

export const starknetAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/, 'Invalid Starknet address format');

// ─── Request schemas ───────────────────────────────────────────────────────────

export const registerUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Username must be lowercase alphanumeric with underscores')
    .optional(),
  email: z.string().email().optional(),
  walletAddress: starknetAddressSchema,
  privyUserId: z.string().optional(),
});

export const prepareTransferSchema = z.object({
  senderWallet: starknetAddressSchema,
  recipient: z.string().min(3).max(200),
  amount: amountSchema,
  token: tokenSchema,
  note: z.string().max(200).optional(),
  gasless: z.boolean().optional(),
});

export const confirmTransferSchema = z.object({
  senderWallet: starknetAddressSchema,
  recipient: z.string().min(3).max(200),
  amount: amountSchema,
  token: tokenSchema,
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
  note: z.string().max(200).optional(),
  recipientEmail: z.string().email().optional(),
  needsEscrow: z.boolean().optional(),
});

export const redeemClaimSchema = z.object({
  recipientWallet: starknetAddressSchema,
});

export const stakeRecordSchema = z.object({
  userWallet: starknetAddressSchema,
  poolAddress: starknetAddressSchema,
  amount: amountSchema,
  token: tokenSchema,
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const aiParseSchema = z.object({
  command: z.string().min(2).max(500),
});

// ─── Middleware factory ────────────────────────────────────────────────────────

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
