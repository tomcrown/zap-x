import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  getOrCreateStarknetWallet,
  rawSignStarknet,
  registerUser,
  getOrCreateTongoKey,
  saveTongoPublicKey,
} from "../services/walletService.js";

const router = Router();

router.post(
  "/starknet",
  requireAuth as any,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { privyUserId, email } = req.user!;

      const walletInfo = await getOrCreateStarknetWallet(privyUserId);

      await registerUser({
        walletAddress: walletInfo.address,
        email,
        privyUserId,
        privyWalletId: walletInfo.id,
        privyWalletPublicKey: walletInfo.publicKey,
      }).catch(() => null);

      getOrCreateTongoKey(privyUserId).catch(() => null);

      res.json({
        walletId: walletInfo.id,
        publicKey: walletInfo.publicKey,
        address: walletInfo.address,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/sign",
  requireAuth as any,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { walletId, hash } = req.body;
      if (!walletId || !hash) {
        res.status(400).json({ error: "walletId and hash are required." });
        return;
      }

      const signature = await rawSignStarknet(walletId, hash);
      res.json({ signature });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/tongo",
  requireAuth as any,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tongoKey = await getOrCreateTongoKey(req.user!.privyUserId);
      res.json(tongoKey);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/tongo/pubkey",
  requireAuth as any,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { x, y } = req.body;
      if (!x || !y) {
        res
          .status(400)
          .json({ error: "x and y public key coordinates are required." });
        return;
      }
      await saveTongoPublicKey(req.user!.privyUserId, String(x), String(y));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
