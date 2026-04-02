/**
 * ClaimService
 *
 * Manages the full lifecycle of claim links:
 *  1. create()   — called when sending to an email/username without a wallet.
 *                  Records the escrow details and returns a claim token.
 *  2. get()      — fetch details for display on the claim page.
 *  3. redeem()   — releases escrowed funds to the recipient's wallet.
 *                  Called after the recipient authenticates and provides
 *                  their wallet address.
 *
 * Escrow Model:
 *  The sender's frontend transfers funds directly to the ESCROW_WALLET_ADDRESS
 *  before calling this service. The escrow tx hash is stored alongside the
 *  claim record. On redemption, the backend signs an outgoing transfer from
 *  the escrow wallet using ESCROW_PRIVATE_KEY.
 */

import { Account, RpcProvider, Signer, uint256, Contract, CallData } from 'starknet';
import { config } from '../config/index.js';
import getDb from '../db/database.js';
import { DbClaimLink, ClaimLinkDetails, ClaimStatus, TokenSymbol } from '../models/types.js';
import { generateClaimToken, isValidStarknetAddress } from '../utils/crypto.js';
import { claimExpiry, TOKEN_ADDRESSES, parseAmount } from '../utils/helpers.js';

// Minimal ERC-20 ABI for transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'felt' },
      { name: 'amount', type: 'Uint256' },
    ],
    outputs: [{ name: 'success', type: 'felt' }],
    stateMutability: 'external',
  },
] as const;

// ─── Create Claim Link ─────────────────────────────────────────────────────────

export function createClaimLink(params: {
  senderWallet: string;
  recipientEmail?: string;
  recipientUsername?: string;
  amount: string;
  tokenType: TokenSymbol;
  escrowTxHash?: string;
}): DbClaimLink {
  const db = getDb();
  const token = generateClaimToken();
  const expiresAt = claimExpiry(7);

  const stmt = db.prepare(`
    INSERT INTO claim_links
      (token, sender_wallet, recipient_email, recipient_username, amount, token_type, escrow_tx_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);

  const row = stmt.get(
    token,
    params.senderWallet,
    params.recipientEmail ?? null,
    params.recipientUsername ?? null,
    params.amount,
    params.tokenType,
    params.escrowTxHash ?? null,
    expiresAt
  ) as DbClaimLink;

  return row;
}

// ─── Get Claim Link ────────────────────────────────────────────────────────────

export function getClaimLink(token: string): ClaimLinkDetails | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM claim_links WHERE token = ?')
    .get(token) as DbClaimLink | undefined;

  if (!row) return null;

  return rowToDetails(row);
}

export function getClaimLinksByWallet(senderWallet: string): ClaimLinkDetails[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM claim_links WHERE sender_wallet = ? ORDER BY created_at DESC')
    .all(senderWallet) as DbClaimLink[];

  return rows.map(rowToDetails);
}

// ─── Redeem Claim Link ─────────────────────────────────────────────────────────

export async function redeemClaimLink(
  token: string,
  recipientWallet: string
): Promise<{ txHash: string }> {
  const db = getDb();

  if (!isValidStarknetAddress(recipientWallet)) {
    throw new Error('Invalid recipient wallet address.');
  }

  const row = db
    .prepare('SELECT * FROM claim_links WHERE token = ?')
    .get(token) as DbClaimLink | undefined;

  if (!row) throw new Error('Claim link not found.');
  if (row.status !== 'pending') throw new Error(`Claim link is already ${row.status}.`);

  const now = new Date();
  if (new Date(row.expires_at) < now) {
    db.prepare("UPDATE claim_links SET status = 'expired' WHERE token = ?").run(token);
    throw new Error('This claim link has expired.');
  }

  // ── Release escrow: transfer from backend escrow wallet to recipient ──────
  const txHash = await releaseEscrow(recipientWallet, row.amount, row.token_type as TokenSymbol);

  // Update claim link record
  db.prepare(`
    UPDATE claim_links
    SET status = 'claimed', claim_tx_hash = ?
    WHERE token = ?
  `).run(txHash, token);

  return { txHash };
}

// ─── Cancel Claim Link ─────────────────────────────────────────────────────────

export async function cancelClaimLink(token: string, senderWallet: string): Promise<{ txHash: string }> {
  const db = getDb();

  const row = db
    .prepare('SELECT * FROM claim_links WHERE token = ? AND sender_wallet = ?')
    .get(token, senderWallet) as DbClaimLink | undefined;

  if (!row) throw new Error('Claim link not found or not owned by you.');
  if (row.status !== 'pending') throw new Error(`Cannot cancel a ${row.status} claim.`);

  // Refund escrow back to sender
  const txHash = await releaseEscrow(senderWallet, row.amount, row.token_type as TokenSymbol);

  db.prepare(`
    UPDATE claim_links
    SET status = 'cancelled', claim_tx_hash = ?
    WHERE token = ?
  `).run(txHash, token);

  return { txHash };
}

// ─── Internal: Release funds from escrow wallet ────────────────────────────────

async function releaseEscrow(
  recipientAddress: string,
  amount: string,
  token: TokenSymbol
): Promise<string> {
  if (!config.escrow.privateKey || !config.escrow.walletAddress) {
    // Dev mode: return a mock tx hash
    console.warn('[ClaimService] Escrow keys not configured — returning mock tx hash.');
    return '0x' + '0'.repeat(63) + '1';
  }

  const provider = new RpcProvider({ nodeUrl: config.starknet.rpcUrl });

  const escrowAccount = new Account({
    address: config.escrow.walletAddress,
    signer: new Signer(config.escrow.privateKey),
    provider,
  });

  const tokenAddress = TOKEN_ADDRESSES[token][config.starknet.network];
  const rawAmount = parseAmount(amount, token);
  const uint256Amount = uint256.bnToUint256(rawAmount);

  const call = {
    contractAddress: tokenAddress,
    entrypoint: 'transfer',
    calldata: CallData.compile({
      recipient: recipientAddress,
      amount: uint256Amount,
    }),
  };

  // starknet.js v9 auto-estimates fees and submits V3 transactions correctly
  const response = await escrowAccount.execute([call]);

  // Don't wait for full confirmation — return the hash immediately.
  // The tx is already submitted and signed; confirmation happens async on-chain.
  return response.transaction_hash;
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function rowToDetails(row: DbClaimLink): ClaimLinkDetails {
  return {
    token: row.token,
    senderWallet: row.sender_wallet,
    amount: row.amount,
    tokenType: row.token_type as TokenSymbol,
    recipientEmail: row.recipient_email,
    recipientUsername: row.recipient_username,
    status: row.status as ClaimStatus,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
