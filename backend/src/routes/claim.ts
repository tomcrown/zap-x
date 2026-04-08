import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate, redeemClaimSchema } from '../middleware/validation.js';
import {
  getClaimLink,
  getClaimLinksByWallet,
  redeemClaimLink,
  cancelClaimLink,
} from '../services/claimService.js';
import getDb from '../db/database.js';

const router = Router();

// GET /api/claim/:token — Public endpoint to show claim page details
router.get('/:token', async (req, res, next) => {
  try {
    const details = getClaimLink(req.params.token);
    if (!details) {
      res.status(404).json({ error: 'Claim link not found or already used.' });
      return;
    }
    res.json({ claim: details });
  } catch (err) {
    next(err);
  }
});

/** Normalize a Starknet address to lowercase 0x-prefixed 64-char hex for comparison. */
function normalizeAddress(addr: string): string {
  if (!addr) return '';
  try {
    const n = BigInt(addr.toLowerCase());
    return '0x' + n.toString(16).padStart(64, '0');
  } catch {
    return addr.toLowerCase();
  }
}

// POST /api/claim/:token/redeem — Authenticated: claim funds into caller's wallet
router.post('/:token/redeem', requireAuth as any, validate(redeemClaimSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { token } = req.params;
    const { recipientWallet } = req.body;

    // Verify the wallet belongs to the authenticated Privy user (look up by privy_user_id)
    const db = getDb();
    const dbUser = db
      .prepare('SELECT wallet_address FROM users WHERE privy_user_id = ?')
      .get(req.user!.privyUserId) as { wallet_address: string } | undefined;

    const authorizedWallet = dbUser?.wallet_address ?? req.user!.walletAddress;
    // Normalize both addresses before comparing — Privy and starkzap SDK may return
    // the same address with different leading-zero padding or casing.
    if (!authorizedWallet || normalizeAddress(recipientWallet) !== normalizeAddress(authorizedWallet)) {
      res.status(403).json({ error: 'Recipient wallet does not match authenticated user.' });
      return;
    }

    const result = await redeemClaimLink(token, recipientWallet);
    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message?.includes('expired') || err.message?.includes('already')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// POST /api/claim/:token/cancel — Sender cancels the claim and gets refund
router.post('/:token/cancel', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await cancelClaimLink(req.params.token, req.user!.walletAddress);
    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message?.includes('not found') || err.message?.includes('Cannot cancel')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// GET /api/claim — Get all claim links sent by the authenticated wallet
router.get('/', requireAuth as any, (req: AuthenticatedRequest, res, next) => {
  try {
    const claims = getClaimLinksByWallet(req.user!.walletAddress);
    res.json({ claims });
  } catch (err) {
    next(err);
  }
});

export default router;
