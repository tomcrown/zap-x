/**
 * StakingService
 */

import getDb from '../db/database.js';
import { DbStakingPosition, TokenSymbol } from '../models/types.js';

// ─── Named Pools ───────────────────────────────────────────────────────────────

export const STAKING_POOLS: Record<string, { name: string; token: TokenSymbol; apy: string }> = {
  '0x003bc84d802c8a57cbe4eb4a6afa9b1255e907cba9377b446d6f4edf069403c5': {
    name: 'moonli.me',
    token: 'STRK',
    apy: '~8.5%',
  },
  '0x068b5f8e8eb23a42ad290800f229f09b1bcc8d43537dd27a127769ffa13b59f1': {
    name: 'Teku',
    token: 'STRK',
    apy: '~8.5%',
  },
  '0x05c85dd30df86ed1f2cfe1806417efb2cae421bffdee8110a74a3d3eb95b28d3': {
    name: 'Nethermind',
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
