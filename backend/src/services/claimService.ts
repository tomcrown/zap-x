import { Account, RpcProvider, Signer, uint256, CallData } from "starknet";
import { config } from "../config/index.js";
import getDb from "../db/database.js";
import {
  DbClaimLink,
  ClaimLinkDetails,
  ClaimStatus,
  TokenSymbol,
} from "../models/types.js";
import { generateClaimToken, isValidStarknetAddress } from "../utils/crypto.js";
import { claimExpiry, TOKEN_ADDRESSES, parseAmount } from "../utils/helpers.js";

export async function createClaimLink(params: {
  senderWallet: string;
  recipientEmail?: string;
  recipientUsername?: string;
  amount: string;
  tokenType: TokenSymbol;
  escrowTxHash?: string;
}): Promise<DbClaimLink> {
  const sql = getDb();
  const token = generateClaimToken();
  const expiresAt = claimExpiry(7);

  const [row] = await sql<DbClaimLink[]>`
    INSERT INTO claim_links
      (token, sender_wallet, recipient_email, recipient_username, amount, token_type, escrow_tx_hash, expires_at)
    VALUES (
      ${token},
      ${params.senderWallet},
      ${params.recipientEmail ?? null},
      ${params.recipientUsername ?? null},
      ${params.amount},
      ${params.tokenType},
      ${params.escrowTxHash ?? null},
      ${expiresAt}
    )
    RETURNING *
  `;

  return row;
}

export async function getClaimLink(
  token: string,
): Promise<ClaimLinkDetails | null> {
  const sql = getDb();
  const [row] = await sql<
    DbClaimLink[]
  >`SELECT * FROM claim_links WHERE token = ${token}`;
  return row ? rowToDetails(row) : null;
}

export async function getClaimLinksByWallet(
  senderWallet: string,
): Promise<ClaimLinkDetails[]> {
  const sql = getDb();
  const padded = "0x" + BigInt(senderWallet).toString(16).padStart(64, "0");
  const unpadded = "0x" + BigInt(senderWallet).toString(16);
  const rows = await sql<DbClaimLink[]>`
    SELECT * FROM claim_links
    WHERE sender_wallet IN ${sql([padded, unpadded])}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToDetails);
}

export async function redeemClaimLink(
  token: string,
  recipientWallet: string,
): Promise<{ txHash: string }> {
  const sql = getDb();

  if (!isValidStarknetAddress(recipientWallet)) {
    throw new Error("Invalid recipient wallet address.");
  }

  const [row] = await sql<
    DbClaimLink[]
  >`SELECT * FROM claim_links WHERE token = ${token}`;

  if (!row) throw new Error("Claim link not found.");
  if (row.status !== "pending")
    throw new Error(`Claim link is already ${row.status}.`);

  const now = new Date();
  if (new Date(row.expires_at) < now) {
    await sql`UPDATE claim_links SET status = 'expired' WHERE token = ${token}`;
    throw new Error("This claim link has expired.");
  }

  const txHash = await releaseEscrow(
    recipientWallet,
    row.amount,
    row.token_type as TokenSymbol,
  );

  await sql`
    UPDATE claim_links
    SET status = 'claimed', claim_tx_hash = ${txHash}
    WHERE token = ${token}
  `;

  await sql`
    INSERT INTO transactions
      (sender_wallet, recipient_wallet, recipient_identifier, amount, token, tx_hash, status, note)
    VALUES (
      ${config.escrow.walletAddress},
      ${recipientWallet},
      ${recipientWallet},
      ${row.amount},
      ${row.token_type},
      ${txHash},
      'confirmed',
      ${"Claimed via link"}
    )
  `;

  if (row.escrow_tx_hash) {
    await sql`
      UPDATE transactions
      SET recipient_wallet = ${recipientWallet}, status = 'confirmed'
      WHERE tx_hash = ${row.escrow_tx_hash}
    `;
  }

  return { txHash };
}

export async function cancelClaimLink(
  token: string,
  senderWallet: string,
): Promise<{ txHash: string }> {
  const sql = getDb();

  const [row] = await sql<DbClaimLink[]>`
    SELECT * FROM claim_links WHERE token = ${token} AND sender_wallet = ${senderWallet}
  `;

  if (!row) throw new Error("Claim link not found or not owned by you.");
  if (row.status !== "pending")
    throw new Error(`Cannot cancel a ${row.status} claim.`);

  const txHash = await releaseEscrow(
    senderWallet,
    row.amount,
    row.token_type as TokenSymbol,
  );

  await sql`
    UPDATE claim_links
    SET status = 'cancelled', claim_tx_hash = ${txHash}
    WHERE token = ${token}
  `;

  return { txHash };
}

async function releaseEscrow(
  recipientAddress: string,
  amount: string,
  token: TokenSymbol,
): Promise<string> {
  if (!config.escrow.privateKey || !config.escrow.walletAddress) {
    console.warn(
      "[ClaimService] Escrow keys not configured — returning mock tx hash.",
    );
    return "0x" + "0".repeat(63) + "1";
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
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient: recipientAddress,
      amount: uint256Amount,
    }),
  };

  const response = await escrowAccount.execute([call]);
  return response.transaction_hash;
}

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
