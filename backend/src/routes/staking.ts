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

const router = Router();

const exitIntentSchema = z.object({
  positionId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const exitSchema = z.object({
  positionId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

// GET /api/staking/pools
router.get('/pools', (_req, res) => {
  const pools = Object.entries(STAKING_POOLS).map(([address, info]) => ({ address, ...info }));
  res.json({ pools });
});

// GET /api/staking/stats
router.get('/stats', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = await getStakingStats(req.user!.walletAddress);
    res.json({ stats });
  } catch (err) { next(err); }
});

// GET /api/staking/positions
router.get('/positions', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const positions = await getStakingPositions(req.user!.walletAddress);
    res.json({ positions });
  } catch (err) { next(err); }
});

// POST /api/staking/record
router.post('/record', requireAuth as any, validate(stakeRecordSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const position = await recordStake(req.body);
    res.json({ success: true, position });
  } catch (err) { next(err); }
});

// POST /api/staking/exit-intent
router.post('/exit-intent', requireAuth as any, validate(exitIntentSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    await recordExitIntent({ ...req.body, userWallet: req.user!.walletAddress });
    res.json({ success: true, message: 'Exit intent recorded. Cooldown period started.' });
  } catch (err) { next(err); }
});

// POST /api/staking/exit
router.post('/exit', requireAuth as any, validate(exitSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    await recordExit({ ...req.body, userWallet: req.user!.walletAddress });
    res.json({ success: true, message: 'Staking position withdrawn.' });
  } catch (err) { next(err); }
});

export default router;
