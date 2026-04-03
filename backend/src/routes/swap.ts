import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { recordSwap, getSwapHistory } from '../services/swapService.js';

const router = Router();

const swapRecordSchema = z.object({
  tokenIn:   z.string().min(1),
  tokenOut:  z.string().min(1),
  amountIn:  z.string().min(1),
  amountOut: z.string().min(1),
  txHash:    z.string().regex(/^0x[0-9a-fA-F]+$/),
  provider:  z.string().min(1).default('avnu'),
});

// GET /api/swap/history
router.get('/history', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const swaps = getSwapHistory(req.user!.walletAddress);
    res.json({ swaps });
  } catch (err) { next(err); }
});

// POST /api/swap/record — called after on-chain swap succeeds
router.post('/record', requireAuth as any, validate(swapRecordSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const swap = recordSwap({ userWallet: req.user!.walletAddress, ...req.body });
    res.json({ success: true, swap });
  } catch (err) { next(err); }
});

export default router;
