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
  txHash:    z.string().min(1), // Ethereum tx hash (0x...) — different format from Starknet
});

// GET /api/bridge/history
router.get('/history', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM bridge_records WHERE user_wallet = ? ORDER BY created_at DESC LIMIT 20`)
      .all(req.user!.walletAddress) as BridgeRecord[];
    res.json({ records: rows });
  } catch (err) { next(err); }
});

// POST /api/bridge/record — save after Ethereum tx submitted
router.post('/record', requireAuth as any, validate(recordSchema), (req: AuthenticatedRequest, res, next) => {
  try {
    const { token, amount, fromChain, txHash } = req.body;
    const row = getDb().prepare(`
      INSERT INTO bridge_records (user_wallet, token, amount, from_chain, tx_hash)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `).get(req.user!.walletAddress, token, amount, fromChain, txHash) as BridgeRecord;
    res.json({ success: true, record: row });
  } catch (err) { next(err); }
});

export default router;
