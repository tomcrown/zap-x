import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import getDb from '../db/database.js';
import { BridgeRecord } from '../models/types.js';

const router = Router();

const recordSchema = z.object({
  token:     z.string().min(1),
  amount:    z.string().min(1),
  fromChain: z.string().min(1).default('ethereum'),
  txHash:    z.string().min(1),
});

// GET /api/bridge/history
router.get('/history', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = await getDb()<BridgeRecord[]>`
      SELECT * FROM bridge_records WHERE user_wallet = ${req.user!.walletAddress} ORDER BY created_at DESC LIMIT 20
    `;
    res.json({ records: rows });
  } catch (err) { next(err); }
});

// POST /api/bridge/record
router.post('/record', requireAuth as any, validate(recordSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { token, amount, fromChain, txHash } = req.body;
    const [row] = await getDb()<BridgeRecord[]>`
      INSERT INTO bridge_records (user_wallet, token, amount, from_chain, tx_hash)
      VALUES (${req.user!.walletAddress}, ${token}, ${amount}, ${fromChain}, ${txHash})
      RETURNING *
    `;
    res.json({ success: true, record: row });
  } catch (err) { next(err); }
});

export default router;
