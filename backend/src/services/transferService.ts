/**
 * TransferService
 *
 * Orchestrates token transfers. The actual on-chain signing happens in the
 * FRONTEND (the user's Privy/Starkzap wallet signs the transaction).
 * This service:
 *   1. Resolves the recipient (username → address, email → escrow flow).
 *   2. Records the transaction in the database.
 *   3. Creates a claim link + sends email when the recipient has no wallet.
 *   4. Returns instructions to the frontend on what transaction to execute.
 */

import { config } from '../config/index.js';
import getDb from '../db/database.js';
import { DbTransaction, SendRequest, SendResponse, TokenSymbol, TransactionStatus } from '../models/types.js';
import { detectRecipientType, isValidStarknetAddress } from '../utils/crypto.js';
import { normaliseUsername } from '../utils/helpers.js';
import { lookupByEmail, lookupByIdentifier, lookupByUsername } from './walletService.js';
import { createClaimLink } from './claimService.js';
import { sendClaimEmail } from './emailService.js';

// ─── Resolve recipient ─────────────────────────────────────────────────────────

interface ResolutionResult {
  recipientAddress: string | null; // null → needs escrow
  needsEscrow: boolean;
  recipientEmail?: string;
  recipientUsername?: string;
}

export async function resolveRecipient(recipient: string): Promise<ResolutionResult> {
  const type = detectRecipientType(recipient);

  switch (type) {
    case 'address':
      return { recipientAddress: recipient, needsEscrow: false };

    case 'username': {
      const username = normaliseUsername(recipient);
      const user = lookupByUsername(username);
      if (user) {
        return { recipientAddress: user.walletAddress, needsEscrow: false };
      }
      // Username not found → cannot escrow without email
      throw new Error(`Username @${username} is not registered on Zap-X.`);
    }

    case 'email': {
      const email = recipient.toLowerCase().trim();
      const user = lookupByEmail(email);
      if (user) {
        return { recipientAddress: user.walletAddress, needsEscrow: false };
      }
      // Email not in our system → escrow + claim flow
      return {
        recipientAddress: config.escrow.walletAddress || null,
        needsEscrow: true,
        recipientEmail: email,
      };
    }

    default:
      throw new Error(`Cannot parse recipient "${recipient}". Use a wallet address, @username, or email.`);
  }
}

// ─── Prepare send ──────────────────────────────────────────────────────────────

/**
 * prepareTransfer()
 *
 * Called BEFORE the frontend executes the on-chain transaction.
 * Returns the target address and, if applicable, claim link details.
 *
 * Frontend flow:
 *   1. POST /api/transfer/prepare  ← this function
 *   2. User signs tx in Privy/Starkzap (frontend)
 *   3. POST /api/transfer/confirm  ← recordConfirmedTransfer()
 */
export async function prepareTransfer(req: SendRequest): Promise<{
  toAddress: string;
  needsEscrow: boolean;
  claimToken?: string;
  claimLink?: string;
  recipientEmail?: string;
}> {
  const resolution = await resolveRecipient(req.recipient);

  if (resolution.needsEscrow) {
    if (!config.escrow.walletAddress) {
      throw new Error('Escrow not configured. Cannot send to recipients without wallets.');
    }

    return {
      toAddress: config.escrow.walletAddress,
      needsEscrow: true,
      recipientEmail: resolution.recipientEmail,
    };
  }

  return { toAddress: resolution.recipientAddress!, needsEscrow: false };
}

// ─── Record confirmed transfer ─────────────────────────────────────────────────

/**
 * recordConfirmedTransfer()
 *
 * Called AFTER the frontend confirms the on-chain tx was submitted.
 * Handles:
 *  - Recording the transaction in the DB.
 *  - Creating a claim link if this was an escrow transfer.
 *  - Sending the claim email to the recipient.
 */
export async function recordConfirmedTransfer(params: {
  senderWallet: string;
  recipient: string;
  amount: string;
  token: TokenSymbol;
  txHash: string;
  note?: string;
  recipientEmail?: string;
  needsEscrow?: boolean;
}): Promise<SendResponse> {
  const db = getDb();

  // Resolve recipient address for the record
  const resolution = await resolveRecipient(params.recipient);

  let claimToken: string | undefined;
  let claimLink: string | undefined;
  let claimLinkId: number | undefined;

  if (params.needsEscrow && params.recipientEmail) {
    // Create claim link record
    const claim = createClaimLink({
      senderWallet: params.senderWallet,
      recipientEmail: params.recipientEmail,
      amount: params.amount,
      tokenType: params.token,
      escrowTxHash: params.txHash,
    });

    claimToken = claim.token;
    claimLink = `${config.frontendUrl}/claim/${claim.token}`;
    claimLinkId = claim.id;

    // Send claim email asynchronously (don't block the response)
    sendClaimEmail({
      recipientEmail: params.recipientEmail,
      senderAddress: params.senderWallet,
      amount: params.amount,
      token: params.token,
      claimLink,
      expiresAt: claim.expires_at,
      note: params.note,
    }).catch((err) => console.error('[EmailService] Failed to send claim email:', err));
  }

  // Record in DB
  const stmt = db.prepare(`
    INSERT INTO transactions
      (sender_wallet, recipient_wallet, recipient_identifier, amount, token, tx_hash, status, note, claim_link_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    params.senderWallet,
    resolution.recipientAddress ?? null,
    params.recipient,
    params.amount,
    params.token,
    params.txHash,
    'pending' satisfies TransactionStatus,
    params.note ?? null,
    claimLinkId ?? null
  );

  return {
    success: true,
    txHash: params.txHash,
    claimToken,
    claimLink,
    message: params.needsEscrow
      ? `Funds escrowed. A claim link has been sent to ${params.recipientEmail}.`
      : `Transfer of ${params.amount} ${params.token} submitted successfully.`,
  };
}

// ─── Update transaction status ─────────────────────────────────────────────────

export function updateTransactionStatus(txHash: string, status: TransactionStatus): void {
  getDb()
    .prepare("UPDATE transactions SET status = ? WHERE tx_hash = ?")
    .run(status, txHash);
}

// ─── Transaction history ───────────────────────────────────────────────────────

export function getTransactionHistory(walletAddress: string): DbTransaction[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT * FROM transactions
      WHERE sender_wallet = ? OR recipient_wallet = ?
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all(walletAddress, walletAddress) as DbTransaction[];
}
