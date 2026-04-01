import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate, stakeRecordSchema } from '../middleware/validation.js';
import {
  recordStake,
  recordExitIntent,
  recordExit,
  getStakingPositions,
  getStakingStats,
  STAKING_POOLS,
} from '../services/stakingService.js';
import { z } from 'zod';
import { starknetAddressSchema } from '../middleware/validation.js';

const router = Router();

const exitIntentSchema = z.object({
  positionId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const exitSchema = z.object({
  positionId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

// GET /api/staking/pools — List available pools with APY info
router.get('/pools', (_req, res) => {
  const pools = Object.entries(STAKING_POOLS).map(([address, info]) => ({
    address,
    ...info,
  }));
  res.json({ pools });
});

// GET /api/staking/stats — Staking stats for authenticated user
router.get('/stats', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = getStakingStats(req.user!.walletAddress);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/staking/positions — All positions for authenticated user
router.get('/positions', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const positions = getStakingPositions(req.user!.walletAddress);
    res.json({ positions });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/staking/record
 * Called by frontend AFTER executing wallet.stake() on-chain.
 * Records the position in our DB for dashboard display.
 */
router.post('/record', requireAuth as any, validate(stakeRecordSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const position = recordStake(req.body);
    res.json({ success: true, position });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/staking/exit-intent
 * Called after wallet.exitPoolIntent() — starts the cooldown period.
 */
router.post('/exit-intent', requireAuth as any, validate(exitIntentSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    recordExitIntent({ ...req.body, userWallet: req.user!.walletAddress });
    res.json({ success: true, message: 'Exit intent recorded. Cooldown period started.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/staking/exit
 * Called after wallet.exitPool() — completes the withdrawal.
 */
router.post('/exit', requireAuth as any, validate(exitSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    recordExit({ ...req.body, userWallet: req.user!.walletAddress });
    res.json({ success: true, message: 'Staking position withdrawn.' });
  } catch (err) {
    next(err);
  }
});

export default router;
