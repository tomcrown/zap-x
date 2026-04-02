/**
 * WalletService
 *
 * Uses two Privy SDK packages:
 *  - @privy-io/server-auth  → user management (getUser, getUserByEmail, verifyAuthToken)
 *  - @privy-io/node         → wallet operations (create, list, rawSign)
 */

import { PrivyClient as PrivyServerClient } from '@privy-io/server-auth';
import { PrivyClient as PrivyNodeClient } from '@privy-io/node';
import { config } from '../config/index.js';
import getDb from '../db/database.js';
import { DbUser, UserProfile } from '../models/types.js';
import { isValidStarknetAddress } from '../utils/crypto.js';
import { normaliseUsername } from '../utils/helpers.js';

// ─── Privy Clients ─────────────────────────────────────────────────────────────

let _privyServer: PrivyServerClient | null = null;
export function getPrivyServer(): PrivyServerClient {
  if (_privyServer) return _privyServer;
  if (!config.privy.appId || !config.privy.appSecret) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set.');
  }
  _privyServer = new PrivyServerClient(config.privy.appId, config.privy.appSecret);
  return _privyServer;
}

let _privyNode: PrivyNodeClient | null = null;
function getPrivyNode(): PrivyNodeClient {
  if (_privyNode) return _privyNode;
  if (!config.privy.appId || !config.privy.appSecret) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set.');
  }
  _privyNode = new PrivyNodeClient({
    appId: config.privy.appId,
    appSecret: config.privy.appSecret,
  });
  return _privyNode;
}

// ─── Starknet Wallet Management ────────────────────────────────────────────────

export interface StarknetWalletInfo {
  id: string;
  address: string;
  publicKey: string;
}

/**
 * Get or create a Privy-managed Starknet wallet for the given Privy user.
 * Safe to call multiple times — returns existing wallet if already created.
 */
export async function getOrCreateStarknetWallet(privyUserId: string): Promise<StarknetWalletInfo> {
  const privy = getPrivyNode();
  const db = getDb();

  // Check our DB first — wallets are server-owned so Privy can't look them up by user_id.
  // This is the single source of truth for the user→wallet mapping.
  const existingRow = db
    .prepare('SELECT privy_wallet_id, wallet_address, privy_wallet_public_key FROM users WHERE privy_user_id = ? AND privy_wallet_id IS NOT NULL')
    .get(privyUserId) as { privy_wallet_id: string; wallet_address: string; privy_wallet_public_key: string } | undefined;

  if (existingRow?.privy_wallet_id) {
    return {
      id: existingRow.privy_wallet_id,
      address: existingRow.wallet_address,
      publicKey: existingRow.privy_wallet_public_key,
    };
  }

  // No wallet yet — create one via Privy
  const serverPublicKey = config.privy.walletPublicKey;
  if (!serverPublicKey) throw new Error('PRIVY_WALLET_PUBLIC_KEY is not set.');

  const wallet = await privy.wallets().create({
    chain_type: 'starknet',
    owner: { public_key: serverPublicKey },
  }) as any;

  const info: StarknetWalletInfo = {
    id: wallet.id,
    address: wallet.address,
    publicKey: wallet.public_key ?? wallet.publicKey,
  };

  // Persist the mapping immediately so future calls return this wallet.
  // Upsert by privy_user_id: insert a stub row if none exists, then set wallet fields.
  // This is atomic — if it fails, the wallet was still created in Privy but we'll
  // create another on the next call. Use Privy dashboard to clean up orphans if needed.
  db.prepare(`
    INSERT INTO users (privy_user_id, wallet_address, privy_wallet_id, privy_wallet_public_key)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(privy_user_id) DO UPDATE SET
      wallet_address          = excluded.wallet_address,
      privy_wallet_id         = excluded.privy_wallet_id,
      privy_wallet_public_key = excluded.privy_wallet_public_key,
      updated_at              = datetime('now')
  `).run(privyUserId, info.address, info.id, info.publicKey);

  return info;
}

/**
 * Sign a Starknet transaction hash using Privy's server-side key management.
 * Called by the PrivySigner inside the Starkzap SDK when signing transactions.
 */
/**
 * Sign a Starknet transaction hash.
 * Wallets are server-owned (owner.public_key), so we authorize with our own private key.
 */
export async function rawSignStarknet(walletId: string, hash: string): Promise<string> {
  const privy = getPrivyNode();
  const serverPrivateKey = config.privy.walletPrivateKey;
  if (!serverPrivateKey) throw new Error('PRIVY_WALLET_PRIVATE_KEY is not set.');

  const result = await privy.wallets().rawSign(walletId, {
    params: { hash },
    authorization_context: {
      authorization_private_keys: [serverPrivateKey],
    },
  });
  return result.signature;
}

// ─── Registration ──────────────────────────────────────────────────────────────

export async function registerUser(params: {
  walletAddress: string;
  username?: string;
  email?: string;
  privyUserId?: string;
  privyWalletId?: string;
  privyWalletPublicKey?: string;
}): Promise<UserProfile> {
  const db = getDb();

  const username = params.username ? normaliseUsername(params.username) : null;
  const email = params.email?.toLowerCase().trim() ?? null;
  const privyUserId = params.privyUserId ?? null;

  // Upsert by privy_user_id (primary identity key). If wallet_address conflicts on
  // a different row, also handle that. We run two statements in a transaction.
  const upsert = db.transaction(() => {
    // 1. If we have a privy_user_id, upsert that row first
    if (privyUserId) {
      db.prepare(`
        INSERT INTO users (privy_user_id, wallet_address, email, username, privy_wallet_id, privy_wallet_public_key)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(privy_user_id) DO UPDATE SET
          wallet_address          = COALESCE(excluded.wallet_address, users.wallet_address),
          email                   = COALESCE(excluded.email, users.email),
          username                = COALESCE(excluded.username, users.username),
          privy_wallet_id         = COALESCE(excluded.privy_wallet_id, users.privy_wallet_id),
          privy_wallet_public_key = COALESCE(excluded.privy_wallet_public_key, users.privy_wallet_public_key),
          updated_at              = datetime('now')
      `).run(
        privyUserId,
        params.walletAddress ?? null,
        email,
        username,
        params.privyWalletId ?? null,
        params.privyWalletPublicKey ?? null,
      );
      return db.prepare('SELECT * FROM users WHERE privy_user_id = ?').get(privyUserId) as DbUser;
    }

    // 2. Fallback: upsert by wallet_address (for cases without privy_user_id)
    if (params.walletAddress && !isValidStarknetAddress(params.walletAddress)) {
      throw new Error('Invalid Starknet wallet address.');
    }
    db.prepare(`
      INSERT INTO users (wallet_address, email, username)
      VALUES (?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        email      = COALESCE(excluded.email, users.email),
        username   = COALESCE(excluded.username, users.username),
        updated_at = datetime('now')
    `).run(params.walletAddress ?? null, email, username);
    return db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(params.walletAddress) as DbUser;
  });

  const row = upsert();

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
  return lookupByUsername(normaliseUsername(clean));
}

// ─── Recipient Wallet Creation (for claim links) ───────────────────────────────

/**
 * Create (or retrieve) a Privy-managed Starknet wallet for a recipient
 * identified by email. Used when sending funds to someone without a wallet.
 */
export async function createWalletForEmail(email: string): Promise<{ address: string; userId: string }> {
  const privyServer = getPrivyServer();
  const normalEmail = email.toLowerCase().trim();

  let privyUser = await privyServer.getUserByEmail(normalEmail).catch(() => null);

  if (!privyUser) {
    privyUser = await privyServer.importUser({
      linkedAccounts: [{ type: 'email', address: normalEmail }],
      createEthereumWallet: false,
    });
  }

  const walletInfo = await getOrCreateStarknetWallet(privyUser.id);
  return { address: walletInfo.address, userId: privyUser.id };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function dbUserToProfile(row: DbUser): UserProfile {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
  };
}
