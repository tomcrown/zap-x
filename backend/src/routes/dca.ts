import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import getDb from '../db/database.js';
import { DcaRecord } from '../models/types.js';

const router = Router();

const recordSchema = z.object({
  sellToken:       z.string().min(1),
  buyToken:        z.string().min(1),
  amountPerCycle:  z.string().min(1),
  frequency:       z.string().min(1),
  txHash:          z.string().regex(/^0x[0-9a-fA-F]+$/),
  orderAddress:    z.string().optional(),
});

const cancelSchema = z.object({
  orderAddress: z.string().min(1),
  txHash:       z.string().regex(/^0x[0-9a-fA-F]+$/),
});

// GET /api/dca/orders — local records for the authenticated wallet
router.get('/orders', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM dca_records WHERE user_wallet = ? ORDER BY created_at DESC`)
      .all(req.user!.walletAddress) as DcaRecord[];
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

// POST /api/dca/record — save after on-chain DCA creation
router.post('/record', requireAuth as any, validate(recordSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const { sellToken, buyToken, amountPerCycle, frequency, txHash, orderAddress } = req.body;
    const row = getDb().prepare(`
      INSERT INTO dca_records (user_wallet, sell_token, buy_token, amount_per_cycle, frequency, order_address, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(req.user!.walletAddress, sellToken, buyToken, amountPerCycle, frequency, orderAddress ?? null, txHash) as DcaRecord;
    res.json({ success: true, order: row });
  } catch (err) { next(err); }
});

// POST /api/dca/cancel — mark local record cancelled
router.post('/cancel', requireAuth as any, validate(cancelSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const { orderAddress } = req.body;
    getDb().prepare(`
      UPDATE dca_records SET status = 'cancelled' WHERE order_address = ? AND user_wallet = ?
    `).run(orderAddress, req.user!.walletAddress);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
