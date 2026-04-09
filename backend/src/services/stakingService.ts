/**
 * StakingService
 */

import getDb from '../db/database.js';
import { DbStakingPosition, TokenSymbol } from '../models/types.js';

// ─── Named Pools ───────────────────────────────────────────────────────────────

export const STAKING_POOLS: Record<string, { name: string; token: TokenSymbol; apy: string }> = {
  // Mainnet validators
  '0x072543946080646d1aac08bb4ba6f6531b2b29ce41ebfe72b8a6506500d5220e': {
    name: 'Karnot',
    token: 'STRK',
    apy: '~8.5%',
  },
  '0x00d3b910d8c528bf0216866053c3821ac6c97983dc096bff642e9a3549210ee7': {
    name: 'Ready (prev. Argent)',
    token: 'STRK',
    apy: '~8.5%',
  },
  '0x036963c7b56f08105ffdd7f12560924bdc0cb29ce210417ecbc8bf3c7e4b9090': {
    name: 'AVNU',
    token: 'STRK',
    apy: '~8.5%',
  },
};

// ─── Record Staking Position ───────────────────────────────────────────────────

export async function recordStake(params: {
  userWallet: string;
  poolAddress: string;
  amount: string;
  token: TokenSymbol;
  txHash: string;
}): Promise<DbStakingPosition> {
  const sql = getDb();
  const pool = STAKING_POOLS[params.poolAddress];

  const [row] = await sql<DbStakingPosition[]>`
    INSERT INTO staking_positions
      (user_wallet, pool_address, pool_name, token, staked_amount, entry_tx_hash, status)
    VALUES (
      ${params.userWallet},
      ${params.poolAddress},
      ${pool?.name ?? 'Unknown Pool'},
      ${params.token},
      ${params.amount},
      ${params.txHash},
      'active'
    )
    RETURNING *
  `;

  return row;
}

// ─── Record Exit Intent ────────────────────────────────────────────────────────

export async function recordExitIntent(params: {
  positionId: number;
  userWallet: string;
  txHash: string;
}): Promise<void> {
  await getDb()`
    UPDATE staking_positions
    SET status = 'exiting', exit_intent_tx_hash = ${params.txHash}, updated_at = NOW()
    WHERE id = ${params.positionId} AND user_wallet = ${params.userWallet}
  `;
}

// ─── Record Full Exit ──────────────────────────────────────────────────────────

export async function recordExit(params: {
  positionId: number;
  userWallet: string;
  txHash: string;
}): Promise<void> {
  await getDb()`
    UPDATE staking_positions
    SET status = 'withdrawn', updated_at = NOW()
    WHERE id = ${params.positionId} AND user_wallet = ${params.userWallet}
  `;
}

// ─── Get Positions ─────────────────────────────────────────────────────────────

export async function getStakingPositions(userWallet: string): Promise<DbStakingPosition[]> {
  return getDb()<DbStakingPosition[]>`
    SELECT * FROM staking_positions WHERE user_wallet = ${userWallet} ORDER BY created_at DESC
  `;
}

export async function getActivePositions(userWallet: string): Promise<DbStakingPosition[]> {
  return getDb()<DbStakingPosition[]>`
    SELECT * FROM staking_positions
    WHERE user_wallet = ${userWallet} AND status = 'active'
    ORDER BY created_at DESC
  `;
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────

export interface StakingStats {
  totalStaked: string;
  positions: DbStakingPosition[];
  pools: typeof STAKING_POOLS;
  projectedAnnualYield: string;
}

export async function getStakingStats(userWallet: string): Promise<StakingStats> {
  const positions = await getActivePositions(userWallet);

  let total = 0n;
  for (const p of positions) {
    try {
      total += BigInt(Math.round(parseFloat(p.staked_amount) * 1e18));
    } catch {
      // ignore parse errors
    }
  }

  const totalStakedFloat = Number(total) / 1e18;
  const projectedYield = (totalStakedFloat * 0.085).toFixed(4);

  return {
    totalStaked: totalStakedFloat.toFixed(6),
    positions,
    pools: STAKING_POOLS,
    projectedAnnualYield: projectedYield,
  };
}
