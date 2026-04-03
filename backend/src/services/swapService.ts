import getDb from '../db/database.js';
import { TokenSymbol } from '../models/types.js';

export interface DbSwap {
  id: number;
  user_wallet: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  tx_hash: string;
  provider: string;
  created_at: string;
}

export function recordSwap(params: {
  userWallet: string;
  tokenIn: TokenSymbol;
  tokenOut: TokenSymbol;
  amountIn: string;
  amountOut: string;
  txHash: string;
  provider: string;
}): DbSwap {
  return getDb().prepare(`
    INSERT INTO swaps (user_wallet, token_in, token_out, amount_in, amount_out, tx_hash, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    params.userWallet, params.tokenIn, params.tokenOut,
    params.amountIn, params.amountOut, params.txHash, params.provider
  ) as DbSwap;
}

export function getSwapHistory(userWallet: string): DbSwap[] {
  return getDb()
    .prepare('SELECT * FROM swaps WHERE user_wallet = ? ORDER BY created_at DESC LIMIT 50')
    .all(userWallet) as DbSwap[];
}
