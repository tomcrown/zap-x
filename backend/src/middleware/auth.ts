/**
 * Auth Middleware
 *
 * Verifies Privy JWTs sent in the Authorization header.
 * Sets req.user on success.
 */

import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { config } from '../config/index.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    privyUserId: string;
    walletAddress: string;
    email?: string;
  };
}

let _privy: PrivyClient | null = null;
function getPrivy(): PrivyClient | null {
  if (!config.privy.appId || !config.privy.appSecret) return null;
  if (!_privy) _privy = new PrivyClient(config.privy.appId, config.privy.appSecret);
  return _privy;
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

    // Extract Starknet wallet address from linked accounts
    const user = await privy.getUser(claims.userId);
    const starknetWallet = (user.linkedAccounts as any[]).find(
      (acc: any) => acc.type === 'wallet' && acc.chainType === 'starknet'
    );

    if (!starknetWallet?.address) {
      res.status(403).json({ error: 'No Starknet wallet found in this account.' });
      return;
    }

    req.user = {
      privyUserId: claims.userId,
      walletAddress: starknetWallet.address as string,
      email: (user.linkedAccounts as any[]).find((a: any) => a.type === 'email')?.address,
    };

    next();
  } catch {
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
