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

/**
 * POST /api/transfer/prepare
 *
 * Step 1: Resolve recipient and tell the frontend what address to send to.
 * If recipient has no wallet, returns escrow address + flag.
 * Frontend then executes the on-chain transaction.
 */
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

/**
 * POST /api/transfer/confirm
 *
 * Step 2: After the frontend has submitted the on-chain transaction,
 * record it in the DB and (if escrow) create the claim link + send email.
 */
router.post('/confirm', requireAuth as any, validate(confirmTransferSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const response = await recordConfirmedTransfer(req.body);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transfer/history
 *
 * Returns the last 100 sent/received transactions for the authenticated wallet.
 */
router.get('/history', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const txs = getTransactionHistory(req.user!.walletAddress);
    res.json({ transactions: txs });
  } catch (err) {
    next(err);
  }
});

export default router;
