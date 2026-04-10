import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import {
  recordDeposit,
  recordWithdraw,
  getLendingStats,
  getLendingPositions,
} from "../services/lendingService.js";
import getDb from "../db/database.js";

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

router.get(
  "/stats",
  requireAuth as any,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const stats = await getLendingStats(req.user!.walletAddress);
      res.json({ stats });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/positions",
  requireAuth as any,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const positions = await getLendingPositions(req.user!.walletAddress);
      res.json({ positions });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/deposit",
  requireAuth as any,
  validate(depositSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const position = await recordDeposit({
        userWallet: req.user!.walletAddress,
        ...req.body,
      });
      res.json({ success: true, position });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/withdraw",
  requireAuth as any,
  validate(withdrawSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      await recordWithdraw({
        userWallet: req.user!.walletAddress,
        ...req.body,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/void",
  requireAuth as any,
  validate(voidSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { positionIds } = req.body as { positionIds: number[] };
      const sql = getDb();
      await Promise.all(
        positionIds.map(
          (id) =>
            sql`UPDATE lending_positions SET status = 'withdrawn', updated_at = NOW()
            WHERE id = ${id} AND user_wallet = ${req.user!.walletAddress}`,
        ),
      );
      res.json({ success: true, cleared: positionIds.length });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
