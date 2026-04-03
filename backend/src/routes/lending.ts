import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  recordDeposit,
  recordWithdraw,
  getLendingStats,
  getLendingPositions,
} from '../services/lendingService.js';
import getDb from '../db/database.js';

const router = Router();

const depositSchema = z.object({
  token: z.string().min(1),
  amount: z.string().min(1),
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const withdrawSchema = z.object({
  positionId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const voidSchema = z.object({
  positionIds: z.array(z.number().int().positive()).min(1),
});

// GET /api/lending/stats
router.get('/stats', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = getLendingStats(req.user!.walletAddress);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/lending/positions
router.get('/positions', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const positions = getLendingPositions(req.user!.walletAddress);
    res.json({ positions });
  } catch (err) {
    next(err);
  }
});

// POST /api/lending/deposit — record after on-chain deposit
router.post('/deposit', requireAuth as any, validate(depositSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const position = recordDeposit({ userWallet: req.user!.walletAddress, ...req.body });
    res.json({ success: true, position });
  } catch (err) {
    next(err);
  }
});

// POST /api/lending/withdraw — mark position withdrawn
router.post('/withdraw', requireAuth as any, validate(withdrawSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    recordWithdraw({ userWallet: req.user!.walletAddress, ...req.body });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/lending/void — mark orphaned positions (no on-chain shares) as withdrawn
router.post('/void', requireAuth as any, validate(voidSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const { positionIds } = req.body;
    const db = getDb();
    const stmt = db.prepare(
      `UPDATE lending_positions SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ? AND user_wallet = ?`
    );
    for (const id of positionIds) {
      stmt.run(id, req.user!.walletAddress);
    }
    res.json({ success: true, cleared: positionIds.length });
  } catch (err) {
    next(err);
  }
});

export default router;
