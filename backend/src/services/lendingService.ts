/**
 * LendingService
 *
 * Tracks lending positions in our local DB for dashboard display.
 * Actual on-chain lending is executed by the frontend via the Starkzap SDK
 * (wallet.lending().deposit / withdraw). After execution, the frontend
 * calls our API to record the position.
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

export function recordDeposit(params: {
  userWallet: string;
  token: TokenSymbol;
  amount: string;
  txHash: string;
}): DbLendingPosition {
  const db = getDb();
  return db.prepare(`
    INSERT INTO lending_positions (user_wallet, token, supplied_amount, entry_tx_hash, status)
    VALUES (?, ?, ?, ?, 'active')
    RETURNING *
  `).get(params.userWallet, params.token, params.amount, params.txHash) as DbLendingPosition;
}

// ─── Record Withdraw ───────────────────────────────────────────────────────────

export function recordWithdraw(params: {
  positionId: number;
  userWallet: string;
  txHash: string;
}): void {
  getDb().prepare(`
    UPDATE lending_positions
    SET status = 'withdrawn', updated_at = datetime('now')
    WHERE id = ? AND user_wallet = ?
  `).run(params.positionId, params.userWallet);
}

// ─── Get Positions ─────────────────────────────────────────────────────────────

export function getLendingPositions(userWallet: string): DbLendingPosition[] {
  return getDb()
    .prepare('SELECT * FROM lending_positions WHERE user_wallet = ? ORDER BY created_at DESC')
    .all(userWallet) as DbLendingPosition[];
}

export function getActiveLendingPositions(userWallet: string): DbLendingPosition[] {
  return getDb()
    .prepare("SELECT * FROM lending_positions WHERE user_wallet = ? AND status = 'active' ORDER BY created_at DESC")
    .all(userWallet) as DbLendingPosition[];
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

export function getLendingStats(userWallet: string): LendingStats {
  const positions = getActiveLendingPositions(userWallet);

  let total = 0;
  for (const p of positions) {
    total += parseFloat(p.supplied_amount) || 0;
  }

  // Approximate Vesu STRK supply APY ~4-8%
  const projectedYield = (total * 0.06).toFixed(4);

  return {
    totalSupplied: total.toFixed(6),
    positions,
    projectedAnnualYield: projectedYield,
  };
}
