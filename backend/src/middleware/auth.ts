/**
 * Auth Middleware
 *
 * Verifies Privy JWTs sent in the Authorization header.
 * Sets req.user on success.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { getPrivyServer } from '../services/walletService.js';
import getDb from '../db/database.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    privyUserId: string;
    walletAddress: string;
    email?: string;
  };
}

function getPrivy() {
  if (!config.privy.appId || !config.privy.appSecret) return null;
  return getPrivyServer();
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    return;
  }

  const token = authHeader.slice(7);

  const privy = getPrivy();
  if (!privy) {
    // Dev mode: accept a wallet-address token directly (NOT for production)
    if (config.nodeEnv === 'development' && token.startsWith('0x')) {
      req.user = { privyUserId: 'dev-user', walletAddress: token };
      return next();
    }
    res.status(503).json({ error: 'Auth service not configured.' });
    return;
  }

  try {
    const claims = await privy.verifyAuthToken(token);

    const user = await privy.getUser(claims.userId);

    // Our wallets are server-owned, so they don't appear in Privy's linkedAccounts.
    // Look up the wallet address from our DB using the Privy user ID.
    const db = getDb();
    const dbUser = db
      .prepare('SELECT wallet_address FROM users WHERE privy_user_id = ?')
      .get(claims.userId) as { wallet_address: string } | undefined;

    req.user = {
      privyUserId: claims.userId,
      walletAddress: dbUser?.wallet_address ?? '',
      email: (user.linkedAccounts as any[]).find((a: any) => a.type === 'email')?.address,
    };

    next();
  } catch (err: any) {
    console.error('[Auth] verifyAuthToken failed:', err?.message ?? err);
    res.status(401).json({ error: 'Invalid or expired auth token.' });
  }
}

/** Optional auth — sets req.user if token present, but doesn't block if absent */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  await requireAuth(req, res, next);
}
