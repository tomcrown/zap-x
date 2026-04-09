/**
 * WalletService
 *
 * Uses two Privy SDK packages:
 *  - @privy-io/server-auth  → user management (getUser, getUserByEmail, verifyAuthToken)
 *  - @privy-io/node         → wallet operations (create, list, rawSign)
 */

import type { TransactionSql } from 'postgres';
import { PrivyClient as PrivyServerClient } from '@privy-io/server-auth';
import { PrivyClient as PrivyNodeClient } from '@privy-io/node';
import { ec } from 'starknet';
import { config } from '../config/index.js';
import getDb from '../db/database.js';
import { DbUser, UserProfile } from '../models/types.js';
import { isValidStarknetAddress } from '../utils/crypto.js';
import { normaliseUsername } from '../utils/helpers.js';

/**
 * Generate a cryptographically random private key that is valid on the STARK curve.
 * The STARK curve order is ~2^251.6, so plain randomBytes(32) can exceed it.
 * ec.starkCurve.utils.randomPrivateKey() generates a key within [1, n-1].
 */
function generateTongoPrivateKey(): string {
  const keyBytes = ec.starkCurve.utils.randomPrivateKey();
  return '0x' + Buffer.from(keyBytes).toString('hex');
}

/**
 * Derive the Tongo public key {x, y} from a private key using the STARK curve.
 * Uses @noble/curves (via starknet.js) — no Web Crypto API, works in Node.js.
 * Returns null if the stored key is out-of-range (old 32-byte random key).
 */
function deriveTongoPublicKey(privateKey: string): { x: string; y: string } | null {
  try {
    // getPublicKey(key, false) returns uncompressed: [0x04, ...32 bytes x, ...32 bytes y]
    const uncompressed = ec.starkCurve.getPublicKey(privateKey, false);
    const x = '0x' + Buffer.from(uncompressed.slice(1, 33)).toString('hex');
    const y = '0x' + Buffer.from(uncompressed.slice(33, 65)).toString('hex');
    return { x, y };
  } catch {
    // Key is out of the STARK curve order range — caller must regenerate.
    return null;
  }
}

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

export async function getOrCreateStarknetWallet(privyUserId: string): Promise<StarknetWalletInfo> {
  const privy = getPrivyNode();
  const sql = getDb();

  const [existingRow] = await sql<{ privy_wallet_id: string; wallet_address: string; privy_wallet_public_key: string }[]>`
    SELECT privy_wallet_id, wallet_address, privy_wallet_public_key
    FROM users
    WHERE privy_user_id = ${privyUserId} AND privy_wallet_id IS NOT NULL
  `;

  if (existingRow?.privy_wallet_id) {
    return {
      id: existingRow.privy_wallet_id,
      address: existingRow.wallet_address,
      publicKey: existingRow.privy_wallet_public_key,
    };
  }

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

  await sql`
    INSERT INTO users (privy_user_id, wallet_address, privy_wallet_id, privy_wallet_public_key)
    VALUES (${privyUserId}, ${info.address}, ${info.id}, ${info.publicKey})
    ON CONFLICT (privy_user_id) DO UPDATE SET
      wallet_address          = EXCLUDED.wallet_address,
      privy_wallet_id         = EXCLUDED.privy_wallet_id,
      privy_wallet_public_key = EXCLUDED.privy_wallet_public_key,
      updated_at              = NOW()
  `;

  return info;
}

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

function normalizeAddress(addr: string | undefined | null): string | null {
  if (!addr) return null;
  try { return '0x' + BigInt(addr).toString(16).padStart(64, '0'); } catch { return addr; }
}

export async function registerUser(params: {
  walletAddress: string;
  username?: string;
  email?: string;
  privyUserId?: string;
  privyWalletId?: string;
  privyWalletPublicKey?: string;
}): Promise<UserProfile> {
  const sql = getDb();
  params = { ...params, walletAddress: normalizeAddress(params.walletAddress) ?? params.walletAddress };

  const username = params.username ? normaliseUsername(params.username) : null;
  const email = params.email?.toLowerCase().trim() ?? null;
  const privyUserId = params.privyUserId ?? null;

  const row = await sql.begin(async (tx: TransactionSql) => {
    if (privyUserId) {
      await tx`
        INSERT INTO users (privy_user_id, wallet_address, email, username, privy_wallet_id, privy_wallet_public_key)
        VALUES (
          ${privyUserId},
          ${params.walletAddress ?? null},
          ${email},
          ${username},
          ${params.privyWalletId ?? null},
          ${params.privyWalletPublicKey ?? null}
        )
        ON CONFLICT (privy_user_id) DO UPDATE SET
          wallet_address          = COALESCE(EXCLUDED.wallet_address, users.wallet_address),
          email                   = COALESCE(EXCLUDED.email, users.email),
          username                = COALESCE(EXCLUDED.username, users.username),
          privy_wallet_id         = COALESCE(EXCLUDED.privy_wallet_id, users.privy_wallet_id),
          privy_wallet_public_key = COALESCE(EXCLUDED.privy_wallet_public_key, users.privy_wallet_public_key),
          updated_at              = NOW()
      `;
      const [u] = await tx<DbUser[]>`SELECT * FROM users WHERE privy_user_id = ${privyUserId}`;
      return u;
    }

    if (params.walletAddress && !isValidStarknetAddress(params.walletAddress)) {
      throw new Error('Invalid Starknet wallet address.');
    }

    await tx`
      INSERT INTO users (wallet_address, email, username)
      VALUES (${params.walletAddress ?? null}, ${email}, ${username})
      ON CONFLICT (wallet_address) DO UPDATE SET
        email      = COALESCE(EXCLUDED.email, users.email),
        username   = COALESCE(EXCLUDED.username, users.username),
        updated_at = NOW()
    `;
    const [u] = await tx<DbUser[]>`SELECT * FROM users WHERE wallet_address = ${params.walletAddress}`;
    return u;
  });

  return dbUserToProfile(row as DbUser);
}

// ─── Lookup ────────────────────────────────────────────────────────────────────

export async function lookupByUsername(username: string): Promise<UserProfile | null> {
  const sql = getDb();
  const [row] = await sql<DbUser[]>`SELECT * FROM users WHERE username = ${normaliseUsername(username)}`;
  return row ? dbUserToProfile(row) : null;
}

export async function lookupByEmail(email: string): Promise<UserProfile | null> {
  const sql = getDb();
  const normalised = email.toLowerCase().trim();

  // Primary: fast DB lookup by email column
  const [row] = await sql<DbUser[]>`SELECT * FROM users WHERE email = ${normalised}`;
  if (row) return dbUserToProfile(row);

  // Fallback: email column may be NULL for users who registered via claim link
  // (getOrCreateStarknetWallet doesn't set email — only registerUser does).
  // Look them up via Privy, then re-query our DB by privy_user_id.
  try {
    const privyServer = getPrivyServer();
    const privyUser = await privyServer.getUserByEmail(normalised).catch(() => null);
    if (privyUser) {
      const [rowByPrivy] = await sql<DbUser[]>`
        SELECT * FROM users WHERE privy_user_id = ${privyUser.id}
      `;
      if (rowByPrivy) {
        // Backfill the email so future lookups hit the primary path
        await sql`
          UPDATE users SET email = ${normalised}, updated_at = NOW()
          WHERE privy_user_id = ${privyUser.id} AND email IS NULL
        `.catch(() => null);
        return dbUserToProfile(rowByPrivy);
      }
    }
  } catch {
    // Privy lookup failed — treat as not found
  }

  return null;
}

export async function lookupByAddress(address: string): Promise<UserProfile | null> {
  const sql = getDb();
  const padded = normalizeAddress(address);
  const unpadded = address.startsWith('0x') ? '0x' + BigInt(address).toString(16) : address;
  const [row] = await sql<DbUser[]>`
    SELECT * FROM users WHERE wallet_address IN (${padded}, ${unpadded})
  `;
  return row ? dbUserToProfile(row) : null;
}

export async function lookupByIdentifier(identifier: string): Promise<UserProfile | null> {
  const clean = identifier.trim();
  if (clean.startsWith('0x')) return lookupByAddress(clean);
  if (clean.includes('@') && clean.includes('.')) return lookupByEmail(clean);
  return lookupByUsername(normaliseUsername(clean));
}

// ─── Tongo Confidential Key Management ────────────────────────────────────────

export interface TongoKeyInfo {
  privateKey: string;
  publicKeyX: string | null;
  publicKeyY: string | null;
}

/**
 * Get or generate the user's Tongo private key.
 * The key is a random 32-byte hex value, stored custodially in the DB
 * (consistent with the Privy wallet model). The frontend derives the
 * public key from it using the TongoConfidential SDK class.
 */
export async function getOrCreateTongoKey(privyUserId: string): Promise<TongoKeyInfo> {
  const sql = getDb();

  const [row] = await sql<Pick<DbUser, 'tongo_private_key' | 'tongo_public_key_x' | 'tongo_public_key_y'>[]>`
    SELECT tongo_private_key, tongo_public_key_x, tongo_public_key_y
    FROM users WHERE privy_user_id = ${privyUserId}
  `;

  if (row?.tongo_private_key) {
    // If public key is already stored, return immediately.
    if (row.tongo_public_key_x && row.tongo_public_key_y) {
      return {
        privateKey: row.tongo_private_key,
        publicKeyX: row.tongo_public_key_x,
        publicKeyY: row.tongo_public_key_y,
      };
    }

    // Try to derive the public key from the stored private key.
    // Old keys (randomBytes(32)) may exceed the STARK curve order — derivation returns null.
    const derived = deriveTongoPublicKey(row.tongo_private_key);
    if (derived) {
      await sql`
        UPDATE users SET tongo_public_key_x = ${derived.x}, tongo_public_key_y = ${derived.y}, updated_at = NOW()
        WHERE privy_user_id = ${privyUserId}
      `.catch(() => null);
      return { privateKey: row.tongo_private_key, publicKeyX: derived.x, publicKeyY: derived.y };
    }

    // Invalid key (out of STARK curve range) — regenerate. No confidential balance
    // is lost because private transfers were never successfully completed with this key.
  }

  // Generate a STARK-curve-valid private key and derive the public key atomically.
  const privateKey = generateTongoPrivateKey();
  const pub = deriveTongoPublicKey(privateKey)!; // always valid: randomPrivateKey() guarantees range

  await sql`
    UPDATE users
    SET tongo_private_key   = ${privateKey},
        tongo_public_key_x  = ${pub.x},
        tongo_public_key_y  = ${pub.y},
        updated_at          = NOW()
    WHERE privy_user_id = ${privyUserId}
  `;

  return { privateKey, publicKeyX: pub.x, publicKeyY: pub.y };
}

/**
 * Persist the Tongo public key (x, y) for a user.
 * Called by the frontend after deriving the public key from the private key
 * using TongoConfidential.recipientId.
 */
export async function saveTongoPublicKey(privyUserId: string, x: string, y: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users
    SET tongo_public_key_x = ${x}, tongo_public_key_y = ${y}, updated_at = NOW()
    WHERE privy_user_id = ${privyUserId}
  `;
}

/**
 * Look up a user's Tongo public key by their Starknet wallet address.
 * Returns null if the user hasn't activated private transfers yet.
 */
export async function getTongoPublicKey(walletAddress: string): Promise<{ x: string; y: string } | null> {
  const sql = getDb();
  const padded = normalizeAddress(walletAddress);
  const unpadded = '0x' + BigInt(walletAddress).toString(16);

  const [row] = await sql<Pick<DbUser, 'tongo_public_key_x' | 'tongo_public_key_y'>[]>`
    SELECT tongo_public_key_x, tongo_public_key_y
    FROM users
    WHERE wallet_address IN (${padded}, ${unpadded})
      AND tongo_public_key_x IS NOT NULL
  `;

  if (!row?.tongo_public_key_x || !row?.tongo_public_key_y) return null;
  return { x: row.tongo_public_key_x, y: row.tongo_public_key_y };
}

// ─── Recipient Wallet Creation (for claim links) ───────────────────────────────

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
