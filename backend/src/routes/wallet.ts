/**
 * Wallet Routes
 *
 * POST /api/wallet/starknet  — Create or fetch the user's Privy-managed Starknet wallet.
 *                              Returns { walletId, publicKey, address } for Starkzap onboarding.
 *
 * POST /api/wallet/sign      — Proxy for Privy rawSign. Called by PrivySigner inside Starkzap
 *                              when the SDK needs to sign a transaction hash.
 *                              Body: { walletId, hash }  →  Returns { signature }
 */

import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getOrCreateStarknetWallet, rawSignStarknet, registerUser } from '../services/walletService.js';

const router = Router();

// POST /api/wallet/starknet
// Called by the frontend after Privy login to get (or create) the user's Starknet wallet.
router.post('/starknet', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { privyUserId, email } = req.user!;

    // Register user first so the row exists before getOrCreateStarknetWallet tries to UPDATE it
    // (getOrCreateStarknetWallet persists privy_wallet_id back to the user row)
    // We use a placeholder address initially; it gets overwritten once the wallet is known.
    // Simpler: just ensure the user row exists with a pre-insert, then get the wallet.
    const walletInfo = await getOrCreateStarknetWallet(privyUserId);

    // Upsert user with the real wallet address and wallet ID
    await registerUser({
      walletAddress: walletInfo.address,
      email,
      privyUserId,
      privyWalletId: walletInfo.id,
      privyWalletPublicKey: walletInfo.publicKey,
    }).catch(() => null);

    res.json({
      walletId: walletInfo.id,
      publicKey: walletInfo.publicKey,
      address: walletInfo.address,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/wallet/sign
// Called by Starkzap's PrivySigner when signing a transaction hash.
// The SDK sends: { walletId, hash }
router.post('/sign', requireAuth as any, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { walletId, hash } = req.body;
    if (!walletId || !hash) {
      res.status(400).json({ error: 'walletId and hash are required.' });
      return;
    }

    const signature = await rawSignStarknet(walletId, hash);
    res.json({ signature });
  } catch (err) {
    next(err);
  }
});

export default router;
