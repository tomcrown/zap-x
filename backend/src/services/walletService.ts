/**
 * WalletService
 *
 * Handles user registration, wallet lookup, and new-user wallet creation
 * via Privy Server Auth SDK.
 *
 * Flow for new recipients:
 *  1. Recipient has no wallet → backend calls Privy to create one.
 *  2. Privy sends them an email invite (or we do, with the claim link).
 *  3. When they authenticate, their Privy wallet address is returned.
 */

import { PrivyClient } from '@privy-io/server-auth';
import { config } from '../config/index.js';
import getDb from '../db/database.js';
import { DbUser, UserProfile } from '../models/types.js';
import { isValidStarknetAddress } from '../utils/crypto.js';
import { normaliseUsername } from '../utils/helpers.js';

// Lazy-init Privy client so the server starts even without keys configured.
let _privy: PrivyClient | null = null;
function getPrivy(): PrivyClient {
  if (_privy) return _privy;
  if (!config.privy.appId || !config.privy.appSecret) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set to use wallet creation.');
  }
  _privy = new PrivyClient(config.privy.appId, config.privy.appSecret);
  return _privy;
}

// ─── Registration ──────────────────────────────────────────────────────────────

export async function registerUser(params: {
  walletAddress: string;
  username?: string;
  email?: string;
  privyUserId?: string;
}): Promise<UserProfile> {
  const db = getDb();

  if (!isValidStarknetAddress(params.walletAddress)) {
    throw new Error('Invalid Starknet wallet address.');
  }

  const username = params.username ? normaliseUsername(params.username) : null;

  // Upsert: if wallet already exists, update username/email if provided.
  const stmt = db.prepare(`
    INSERT INTO users (username, email, wallet_address, privy_user_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      username     = COALESCE(excluded.username, users.username),
      email        = COALESCE(excluded.email, users.email),
      privy_user_id = COALESCE(excluded.privy_user_id, users.privy_user_id),
      updated_at   = datetime('now')
    RETURNING *
  `);

  const row = stmt.get(
    username,
    params.email?.toLowerCase().trim() ?? null,
    params.walletAddress,
    params.privyUserId ?? null
  ) as DbUser;

  return dbUserToProfile(row);
}

// ─── Lookup ────────────────────────────────────────────────────────────────────

export function lookupByUsername(username: string): UserProfile | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(normaliseUsername(username)) as DbUser | undefined;
  return row ? dbUserToProfile(row) : null;
}

export function lookupByEmail(email: string): UserProfile | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as DbUser | undefined;
  return row ? dbUserToProfile(row) : null;
}

export function lookupByAddress(address: string): UserProfile | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE wallet_address = ?')
    .get(address) as DbUser | undefined;
  return row ? dbUserToProfile(row) : null;
}

export function lookupByIdentifier(identifier: string): UserProfile | null {
  const clean = identifier.trim();

  if (clean.startsWith('0x')) return lookupByAddress(clean);
  if (clean.includes('@') && clean.includes('.')) return lookupByEmail(clean);

  // Could be @username or plain username
  const username = normaliseUsername(clean);
  return lookupByUsername(username);
}

// ─── Privy Wallet Creation ─────────────────────────────────────────────────────

/**
 * Create (or retrieve) a Privy-managed Starknet wallet for a user identified
 * by email. This is used when sending funds to an email that has no wallet yet.
 *
 * Returns the Starknet wallet address once Privy provisions it.
 * Note: Privy may require the user to complete email verification before the
 *       wallet is fully active — this is why we also use the escrow + claim flow.
 */
export async function createWalletForEmail(email: string): Promise<{ address: string; userId: string }> {
  const privy = getPrivy();
  const normalEmail = email.toLowerCase().trim();

  // Check if user already exists in Privy
  let privyUser = await privy.getUserByEmail(normalEmail).catch(() => null);

  if (!privyUser) {
    // Create a new Privy user (sends email invite)
    privyUser = await privy.importUser({
      linkedAccounts: [{ type: 'email', address: normalEmail }],
      createEthereumWallet: false,
      createStarknetWallet: true, // Create Starknet wallet for the user
    });
  }

  // Extract Starknet wallet from linked accounts
  const starknetWallet = (privyUser.linkedAccounts as any[]).find(
    (acc: any) => acc.type === 'wallet' && acc.chainType === 'starknet'
  );

  if (!starknetWallet?.address) {
    throw new Error('Privy could not provision a Starknet wallet for this user.');
  }

  return { address: starknetWallet.address as string, userId: privyUser.id };
}

// ─── Profile ───────────────────────────────────────────────────────────────────

function dbUserToProfile(row: DbUser): UserProfile {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
  };
}
