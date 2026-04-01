/**
 * StakingService
 *
 * Tracks staking positions in our local DB so the dashboard can display
 * them without querying the blockchain on every request.
 *
 * The actual on-chain staking is performed by the FRONTEND using the
 * Starkzap SDK (wallet.stake / wallet.exitPoolIntent / wallet.exitPool).
 * After the frontend executes a staking transaction, it calls our API
 * to record the position.
 */

import getDb from '../db/database.js';
import { DbStakingPosition, StakeStatus, TokenSymbol } from '../models/types.js';
import { config } from '../config/index.js';

// ─── Named Pools ───────────────────────────────────────────────────────────────

export const STAKING_POOLS: Record<string, { name: string; token: TokenSymbol; apy: string }> = {
  [config.staking.strkPoolAddress]: {
    name: 'STRK Staking Pool',
    token: 'STRK',
    apy: '~8.5%', // Approximate — real APY is on-chain
  },
};

// ─── Record Staking Position ───────────────────────────────────────────────────

export function recordStake(params: {
  userWallet: string;
  poolAddress: string;
  amount: string;
  token: TokenSymbol;
  txHash: string;
}): DbStakingPosition {
  const db = getDb();
  const pool = STAKING_POOLS[params.poolAddress];

  const stmt = db.prepare(`
    INSERT INTO staking_positions
      (user_wallet, pool_address, pool_name, token, staked_amount, entry_tx_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
    RETURNING *
  `);

  return stmt.get(
    params.userWallet,
    params.poolAddress,
    pool?.name ?? 'Unknown Pool',
    params.token,
    params.amount,
    params.txHash
  ) as DbStakingPosition;
}

// ─── Record Exit Intent ────────────────────────────────────────────────────────

export function recordExitIntent(params: {
  positionId: number;
  userWallet: string;
  txHash: string;
}): void {
  getDb().prepare(`
    UPDATE staking_positions
    SET status = 'exiting', exit_intent_tx_hash = ?, updated_at = datetime('now')
    WHERE id = ? AND user_wallet = ?
  `).run(params.txHash, params.positionId, params.userWallet);
}

// ─── Record Full Exit ──────────────────────────────────────────────────────────

export function recordExit(params: {
  positionId: number;
  userWallet: string;
  txHash: string;
}): void {
  getDb().prepare(`
    UPDATE staking_positions
    SET status = 'withdrawn', updated_at = datetime('now')
    WHERE id = ? AND user_wallet = ?
  `).run(params.positionId, params.userWallet);
}

// ─── Get Positions ─────────────────────────────────────────────────────────────

export function getStakingPositions(userWallet: string): DbStakingPosition[] {
  return getDb()
    .prepare('SELECT * FROM staking_positions WHERE user_wallet = ? ORDER BY created_at DESC')
    .all(userWallet) as DbStakingPosition[];
}

export function getActivePositions(userWallet: string): DbStakingPosition[] {
  return getDb()
    .prepare("SELECT * FROM staking_positions WHERE user_wallet = ? AND status = 'active' ORDER BY created_at DESC")
    .all(userWallet) as DbStakingPosition[];
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────

export interface StakingStats {
  totalStaked: string;
  positions: DbStakingPosition[];
  pools: typeof STAKING_POOLS;
  projectedAnnualYield: string; // approximate, based on APY
}

export function getStakingStats(userWallet: string): StakingStats {
  const positions = getActivePositions(userWallet);

  // Sum staked amounts (same token assumed for simplicity; extend for multi-token)
  let total = 0n;
  for (const p of positions) {
    try {
      total += BigInt(Math.round(parseFloat(p.staked_amount) * 1e18));
    } catch {
      // ignore parse errors
    }
  }

  const totalStakedFloat = Number(total) / 1e18;
  // Rough projected yield at ~8.5% APY
  const projectedYield = (totalStakedFloat * 0.085).toFixed(4);

  return {
    totalStaked: totalStakedFloat.toFixed(6),
    positions,
    pools: STAKING_POOLS,
    projectedAnnualYield: projectedYield,
  };
}
