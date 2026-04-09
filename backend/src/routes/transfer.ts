import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  validate,
  prepareTransferSchema,
  confirmTransferSchema,
} from '../middleware/validation.js';
import {
  prepareTransfer,
  recordConfirmedTransfer,
  getTransactionHistory,
} from '../services/transferService.js';

const router = Router();

// POST /api/transfer/prepare
router.post('/prepare', requireAuth as any, validate(prepareTransferSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await prepareTransfer(req.body);
    res.json(result);
  } catch (err: any) {
    if (err.message?.includes('not registered')) {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// POST /api/transfer/confirm
router.post('/confirm', requireAuth as any, validate(confirmTransferSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const response = await recordConfirmedTransfer(req.body);
    res.json(response);
  } catch (err) { next(err); }
});

// GET /api/transfer/history
router.get('/history', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const txs = await getTransactionHistory(req.user!.walletAddress);
    res.json({ transactions: txs });
  } catch (err) { next(err); }
});

export default router;
