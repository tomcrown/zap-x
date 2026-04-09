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

export async function recordSwap(params: {
  userWallet: string;
  tokenIn: TokenSymbol;
  tokenOut: TokenSymbol;
  amountIn: string;
  amountOut: string;
  txHash: string;
  provider: string;
}): Promise<DbSwap> {
  const [row] = await getDb()<DbSwap[]>`
    INSERT INTO swaps (user_wallet, token_in, token_out, amount_in, amount_out, tx_hash, provider)
    VALUES (
      ${params.userWallet}, ${params.tokenIn}, ${params.tokenOut},
      ${params.amountIn}, ${params.amountOut}, ${params.txHash}, ${params.provider}
    )
    RETURNING *
  `;
  return row;
}

export async function getSwapHistory(userWallet: string): Promise<DbSwap[]> {
  return getDb()<DbSwap[]>`
    SELECT * FROM swaps WHERE user_wallet = ${userWallet} ORDER BY created_at DESC LIMIT 50
  `;
}
