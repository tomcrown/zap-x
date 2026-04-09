import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  validate,
  prepareTransferSchema,
  confirmTransferSchema,
  privateTransferPrepareSchema,
  privateTransferConfirmSchema,
} from '../middleware/validation.js';
import {
  prepareTransfer,
  recordConfirmedTransfer,
  getTransactionHistory,
  resolvePrivateRecipient,
  recordPrivateTransfer,
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

// ─── Private (Confidential) Transfer ──────────────────────────────────────────

// POST /api/transfer/private/prepare
// Resolves the recipient and returns their Tongo public key for ZK proof generation.
router.post('/private/prepare', requireAuth as any, validate(privateTransferPrepareSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { recipient } = req.body;
    const result = await resolvePrivateRecipient(recipient);
    res.json({ recipientKey: result.tongoKey });
  } catch (err: any) {
    if (
      err.message?.includes('not registered') ||
      err.message?.includes('not activated')
    ) {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// POST /api/transfer/private/confirm
// Records the confidential transfer in the DB after the on-chain txs succeed.
router.post('/private/confirm', requireAuth as any, validate(privateTransferConfirmSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const response = await recordPrivateTransfer(req.body);
    res.json(response);
  } catch (err) { next(err); }
});

export default router;
