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

// GET /api/dca/orders
router.get('/orders', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = await getDb()<DcaRecord[]>`
      SELECT * FROM dca_records WHERE user_wallet = ${req.user!.walletAddress} ORDER BY created_at DESC
    `;
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

// POST /api/dca/record
router.post('/record', requireAuth as any, validate(recordSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { sellToken, buyToken, amountPerCycle, frequency, txHash, orderAddress } = req.body;
    const [row] = await getDb()<DcaRecord[]>`
      INSERT INTO dca_records (user_wallet, sell_token, buy_token, amount_per_cycle, frequency, order_address, tx_hash)
      VALUES (
        ${req.user!.walletAddress}, ${sellToken}, ${buyToken},
        ${amountPerCycle}, ${frequency}, ${orderAddress ?? null}, ${txHash}
      )
      RETURNING *
    `;
    res.json({ success: true, order: row });
  } catch (err) { next(err); }
});

// POST /api/dca/cancel
router.post('/cancel', requireAuth as any, validate(cancelSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    await getDb()`
      UPDATE dca_records SET status = 'cancelled'
      WHERE order_address = ${req.body.orderAddress} AND user_wallet = ${req.user!.walletAddress}
    `;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/dca/patch-address — backfill orderAddress for orders created without it
router.post('/patch-address', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { txHash, orderAddress } = req.body;
    if (!txHash || !orderAddress) {
      res.status(400).json({ error: 'txHash and orderAddress are required.' });
      return;
    }
    await getDb()`
      UPDATE dca_records SET order_address = ${orderAddress}
      WHERE tx_hash = ${txHash} AND user_wallet = ${req.user!.walletAddress} AND order_address IS NULL
    `;
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
