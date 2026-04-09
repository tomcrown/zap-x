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

  let claims: Awaited<ReturnType<typeof privy.verifyAuthToken>>;
  try {
    claims = await privy.verifyAuthToken(token);
  } catch (err: any) {
    console.error('[Auth] verifyAuthToken failed:', err?.message ?? err);
    res.status(401).json({ error: 'Invalid or expired auth token.' });
    return;
  }

  try {
    const [user, dbUser] = await Promise.allSettled([
      privy.getUser(claims.userId),
      getDb()<{ wallet_address: string }[]>`
        SELECT wallet_address FROM users WHERE privy_user_id = ${claims.userId}
      `,
    ]);

    const email = user.status === 'fulfilled'
      ? (user.value.linkedAccounts as any[]).find((a: any) => a.type === 'email')?.address
      : undefined;

    const walletAddress = dbUser.status === 'fulfilled'
      ? (dbUser.value[0]?.wallet_address ?? '')
      : '';

    req.user = { privyUserId: claims.userId, walletAddress, email };

    next();
  } catch (err: any) {
    console.error('[Auth] DB/user lookup failed:', err?.message ?? err);
    next(err);
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
