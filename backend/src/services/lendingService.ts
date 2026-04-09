/**
 * LendingService
 */

import getDb from '../db/database.js';
import { TokenSymbol } from '../models/types.js';

export type LendingStatus = 'active' | 'withdrawn';

export interface DbLendingPosition {
  id: number;
  user_wallet: string;
  token: string;
  supplied_amount: string;
  entry_tx_hash: string | null;
  status: LendingStatus;
  created_at: string;
  updated_at: string;
}

export interface LendingStats {
  totalSupplied: string;
  positions: DbLendingPosition[];
  projectedAnnualYield: string;
}

// ─── Record Deposit ────────────────────────────────────────────────────────────

export async function recordDeposit(params: {
  userWallet: string;
  token: TokenSymbol;
  amount: string;
  txHash: string;
}): Promise<DbLendingPosition> {
  const [row] = await getDb()<DbLendingPosition[]>`
    INSERT INTO lending_positions (user_wallet, token, supplied_amount, entry_tx_hash, status)
    VALUES (${params.userWallet}, ${params.token}, ${params.amount}, ${params.txHash}, 'active')
    RETURNING *
  `;
  return row;
}

// ─── Record Withdraw ───────────────────────────────────────────────────────────

export async function recordWithdraw(params: {
  positionId: number;
  userWallet: string;
  txHash: string;
}): Promise<void> {
  await getDb()`
    UPDATE lending_positions
    SET status = 'withdrawn', updated_at = NOW()
    WHERE id = ${params.positionId} AND user_wallet = ${params.userWallet}
  `;
}

// ─── Get Positions ─────────────────────────────────────────────────────────────

export async function getLendingPositions(userWallet: string): Promise<DbLendingPosition[]> {
  return getDb()<DbLendingPosition[]>`
    SELECT * FROM lending_positions WHERE user_wallet = ${userWallet} ORDER BY created_at DESC
  `;
}

export async function getActiveLendingPositions(userWallet: string): Promise<DbLendingPosition[]> {
  return getDb()<DbLendingPosition[]>`
    SELECT * FROM lending_positions
    WHERE user_wallet = ${userWallet} AND status = 'active'
    ORDER BY created_at DESC
  `;
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

export async function getLendingStats(userWallet: string): Promise<LendingStats> {
  const positions = await getActiveLendingPositions(userWallet);

  let total = 0;
  for (const p of positions) {
    total += parseFloat(p.supplied_amount) || 0;
  }

  const projectedYield = (total * 0.06).toFixed(4);

  return {
    totalSupplied: total.toFixed(6),
    positions,
    projectedAnnualYield: projectedYield,
  };
}
