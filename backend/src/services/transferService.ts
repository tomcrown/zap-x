/**
 * TransferService
 */

import { config } from "../config/index.js";
import getDb from "../db/database.js";
import {
  DbTransaction,
  SendRequest,
  SendResponse,
  TokenSymbol,
  TransactionStatus,
} from "../models/types.js";
import {
  detectRecipientType,
  isValidStarknetAddress,
} from "../utils/crypto.js";
import { normaliseUsername } from "../utils/helpers.js";
import {
  lookupByEmail,
  lookupByIdentifier,
  lookupByUsername,
} from "./walletService.js";
import { createClaimLink } from "./claimService.js";
import { sendClaimEmail } from "./emailService.js";

// ─── Resolve recipient ─────────────────────────────────────────────────────────

interface ResolutionResult {
  recipientAddress: string | null;
  needsEscrow: boolean;
  recipientEmail?: string;
  recipientUsername?: string;
}

export async function resolveRecipient(
  recipient: string,
): Promise<ResolutionResult> {
  const type = detectRecipientType(recipient);

  switch (type) {
    case "address":
      return { recipientAddress: recipient, needsEscrow: false };

    case "username": {
      const username = normaliseUsername(recipient);
      const user = await lookupByUsername(username);
      if (user) {
        return { recipientAddress: user.walletAddress, needsEscrow: false };
      }
      throw new Error(`Username @${username} is not registered on Zap-X.`);
    }

    case "email": {
      const email = recipient.toLowerCase().trim();
      const user = await lookupByEmail(email);
      if (user) {
        return { recipientAddress: user.walletAddress, needsEscrow: false };
      }
      return {
        recipientAddress: config.escrow.walletAddress || null,
        needsEscrow: true,
        recipientEmail: email,
      };
    }

    default:
      throw new Error(
        `Cannot parse recipient "${recipient}". Use a wallet address, @username, or email.`,
      );
  }
}

// ─── Prepare send ──────────────────────────────────────────────────────────────

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
      throw new Error(
        "Escrow not configured. Cannot send to recipients without wallets.",
      );
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
  const sql = getDb();
  const resolution = await resolveRecipient(params.recipient);

  let claimToken: string | undefined;
  let claimLink: string | undefined;
  let claimLinkId: number | undefined;

  if (params.needsEscrow && params.recipientEmail) {
    const claim = await createClaimLink({
      senderWallet: params.senderWallet,
      recipientEmail: params.recipientEmail,
      amount: params.amount,
      tokenType: params.token,
      escrowTxHash: params.txHash,
    });

    claimToken = claim.token;
    claimLink = `${config.frontendUrl}/claim/${claim.token}`;
    claimLinkId = claim.id;

    sendClaimEmail({
      recipientEmail: params.recipientEmail,
      senderAddress: params.senderWallet,
      amount: params.amount,
      token: params.token,
      claimLink,
      expiresAt: claim.expires_at,
      note: params.note,
    }).catch((err) =>
      console.error("[EmailService] Failed to send claim email:", err),
    );
  }

  await sql`
    INSERT INTO transactions
      (sender_wallet, recipient_wallet, recipient_identifier, amount, token, tx_hash, status, note, claim_link_id)
    VALUES (
      ${params.senderWallet},
      ${resolution.recipientAddress ?? null},
      ${params.recipient},
      ${params.amount},
      ${params.token},
      ${params.txHash},
      ${"pending" satisfies TransactionStatus},
      ${params.note ?? null},
      ${claimLinkId ?? null}
    )
  `;

  return {
    success: true,
    txHash: params.txHash,
    claimToken,
    claimLink,
    message: params.needsEscrow
      ? `A claim link has been sent to ${params.recipientEmail}.`
      : `Transfer of ${params.amount} ${params.token} submitted successfully.`,
  };
}

// ─── Update transaction status ─────────────────────────────────────────────────

export async function updateTransactionStatus(
  txHash: string,
  status: TransactionStatus,
): Promise<void> {
  await getDb()`UPDATE transactions SET status = ${status} WHERE tx_hash = ${txHash}`;
}

// ─── Transaction history ───────────────────────────────────────────────────────

export async function getTransactionHistory(walletAddress: string): Promise<DbTransaction[]> {
  // Normalize to both padded (0x07aee...) and unpadded (0x7aee...) forms
  // so we match regardless of how the address was stored.
  const padded = '0x' + BigInt(walletAddress).toString(16).padStart(64, '0');
  const unpadded = '0x' + BigInt(walletAddress).toString(16);
  return getDb()<DbTransaction[]>`
    SELECT * FROM transactions
    WHERE sender_wallet IN (${padded}, ${unpadded})
       OR recipient_wallet IN (${padded}, ${unpadded})
    ORDER BY created_at DESC
    LIMIT 100
  `;
}
