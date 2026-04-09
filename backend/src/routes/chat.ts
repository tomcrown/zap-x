/**
 * POST /api/chat
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { parseCommand } from "../services/aiService.js";
import { lookupByIdentifier } from "../services/walletService.js";
import { ParsedAction } from "../models/types.js";
import {
  getActiveLendingPositions,
  getLendingStats,
} from "../services/lendingService.js";
import getDb from "../db/database.js";

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(500),
});

// ─── Unified Activity Feed ────────────────────────────────────────────────────

export interface ActivityItem {
  kind: "send" | "receive" | "swap" | "dca" | "save" | "withdraw" | "bridge";
  token: string;
  amount: string;
  label: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

async function getUnifiedActivity(walletAddress: string): Promise<ActivityItem[]> {
  const sql = getDb();

  const [sends, receives, swaps, dcaRows, saves, bridges] = await Promise.all([
    sql<ActivityItem[]>`
      SELECT 'send' AS kind, token, amount, recipient_identifier AS label,
             status, tx_hash, created_at
      FROM transactions
      WHERE sender_wallet = ${walletAddress} AND status != 'failed'
      ORDER BY created_at DESC LIMIT 8`,

    sql<ActivityItem[]>`
      SELECT 'receive' AS kind, token, amount, sender_wallet AS label,
             status, tx_hash, created_at
      FROM transactions
      WHERE recipient_wallet = ${walletAddress} AND sender_wallet != ${walletAddress} AND status != 'failed'
      ORDER BY created_at DESC LIMIT 8`,

    sql<ActivityItem[]>`
      SELECT 'swap' AS kind, token_in AS token, amount_in AS amount,
             token_out AS label, 'confirmed' AS status, tx_hash, created_at
      FROM swaps WHERE user_wallet = ${walletAddress}
      ORDER BY created_at DESC LIMIT 8`,

    sql<ActivityItem[]>`
      SELECT 'dca' AS kind, sell_token AS token, amount_per_cycle AS amount,
             buy_token AS label, status, tx_hash, created_at
      FROM dca_records WHERE user_wallet = ${walletAddress}
      ORDER BY created_at DESC LIMIT 5`,

    sql<ActivityItem[]>`
      SELECT CASE WHEN status = 'withdrawn' THEN 'withdraw' ELSE 'save' END AS kind,
             token, supplied_amount AS amount, 'Vesu' AS label,
             status, entry_tx_hash AS tx_hash, created_at
      FROM lending_positions WHERE user_wallet = ${walletAddress}
      ORDER BY created_at DESC LIMIT 5`,

    sql<ActivityItem[]>`
      SELECT 'bridge' AS kind, token, amount, from_chain AS label,
             'confirmed' AS status, tx_hash, created_at
      FROM bridge_records WHERE user_wallet = ${walletAddress}
      ORDER BY created_at DESC LIMIT 5`,
  ]);

  return [...sends, ...receives, ...swaps, ...dcaRows, ...saves, ...bridges]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);
}

// ─── Intent detection ──────────────────────────────────────────────────────────

const BALANCE_RE =
  /\b(balance|portfolio|holdings|how much|what.*(have|got))\b/i;
const HISTORY_RE =
  /\b(histor|recent|transaction|transfer|sent|received|activity|show.*tx|past)\b/i;
const POSITION_RE =
  /\b(lending|position|earning|yield|supplied|deposited|lend|vesu|saving|invested)\b/i;
const HELP_RE = /\b(what|help|can you|how|capabilities|commands)\b/i;
const GREETING_RE = /^(hi|hello|hey|yo|sup|gm|hola)[!. ]*$/i;

// ─── Action enrichment ─────────────────────────────────────────────────────────

async function enrichAction(
  action: ParsedAction,
  senderWallet: string,
): Promise<{
  action: ParsedAction;
  ready: boolean;
  warning?: string;
  recipientAddress?: string;
  needsEscrow?: boolean;
}> {
  const amt = parseFloat(action.amount);
  if (isNaN(amt) || amt <= 0) {
    if (action.type === "unstake") {
      const positions = await getActiveLendingPositions(senderWallet);
      const pos = positions.find(
        (p) => p.token === action.token && p.status === "active",
      );
      if (pos) {
        return {
          action: { ...action, amount: pos.supplied_amount },
          ready: true,
        };
      }
      return {
        action,
        ready: false,
        warning: `No active ${action.token} lending position found.`,
      };
    }
    return { action, ready: false, warning: "Invalid amount." };
  }

  if (action.type === "send") {
    if (!action.recipient) {
      return { action, ready: false, warning: "No recipient specified." };
    }
    if (action.recipient.toLowerCase() === senderWallet.toLowerCase()) {
      return { action, ready: false, warning: "Cannot send to yourself." };
    }

    const resolved = await lookupByIdentifier(action.recipient);
    if (resolved?.walletAddress) {
      return {
        action,
        ready: true,
        recipientAddress: resolved.walletAddress,
        needsEscrow: false,
      };
    }

    const isEmail =
      action.recipient.includes("@") && action.recipient.includes(".");
    const isAddress = action.recipient.startsWith("0x");

    if (isEmail) {
      return {
        action,
        ready: true,
        needsEscrow: true,
        warning:
          "Recipient has no Zap-X wallet — they'll receive a claim link by email (Check spam folder).",
      };
    }
    if (isAddress) {
      return { action, ready: true, recipientAddress: action.recipient };
    }

    return {
      action,
      ready: false,
      warning: `Could not resolve "${action.recipient}". Use an email, @username, or 0x address.`,
    };
  }

  if (action.type === "swap") {
    if (!action.toToken)
      return { action, ready: false, warning: "No target token specified for swap." };
    if (action.token === action.toToken)
      return { action, ready: false, warning: "Cannot swap a token for itself." };
  }

  if (action.type === "bridge") {
    if (!action.fromChain)
      return { action, ready: false, warning: 'Specify the source chain, e.g. "from Ethereum".' };
    return {
      action,
      ready: true,
      warning: "MetaMask required. Clicking confirm will open MetaMask and switch it to Ethereum Sepolia.",
    };
  }

  if (action.type === "dca") {
    if (!action.toToken)
      return { action, ready: false, warning: 'Specify the token to buy, e.g. "buy 10 USDC every week".' };
    if (!action.frequency)
      return { action, ready: false, warning: "Specify a frequency: daily, weekly, or monthly." };
    if (action.token === action.toToken)
      return { action, ready: false, warning: "Cannot DCA a token for itself." };
    return { action, ready: true };
  }

  if (action.type === "borrow") {
    if (!action.collateralToken)
      return { action: { ...action, collateralToken: "STRK" }, ready: true };
    return { action, ready: true, warning: "Note: Vesu borrow on Sepolia may have oracle limitations." };
  }

  if (action.type === "repay") {
    if (!action.collateralToken)
      return { action: { ...action, collateralToken: "STRK" }, ready: true };
    return { action, ready: true };
  }

  return { action, ready: true };
}

// ─── Route ─────────────────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth as any,
  validate(chatSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { message } = req.body;
      const walletAddress = req.user!.walletAddress;
      const lower = message.toLowerCase().trim();

      if (BALANCE_RE.test(lower)) {
        res.json({
          success: true,
          message: "Your live balances are shown at the top of the screen. Tap the STRK amount to see all tokens.",
          actions: [],
        });
        return;
      }

      if (HISTORY_RE.test(lower)) {
        const items = await getUnifiedActivity(walletAddress);
        if (items.length === 0) {
          res.json({ success: true, message: "No activity yet. Try sending some STRK!", actions: [], data: { type: "history", items: [] } });
          return;
        }
        res.json({
          success: true,
          message: `${items.length} recent activit${items.length !== 1 ? "ies" : "y"}`,
          actions: [],
          data: { type: "history", items },
        });
        return;
      }

      if (POSITION_RE.test(lower) && !lower.match(/\b(lend|save|invest|supply|deposit|withdraw|unstake|pull)\b.*[\d]/)) {
        const positions = await getActiveLendingPositions(walletAddress);
        const stats = await getLendingStats(walletAddress);
        if (positions.length === 0) {
          res.json({
            success: true,
            message: 'You have no active lending positions. Try "save 10 USDC" to start earning yield on Vesu.',
            actions: [],
          });
          return;
        }
        const lines = positions.map(
          (p) => `${p.token}  ${parseFloat(p.supplied_amount).toFixed(4)} supplied`,
        );
        res.json({
          success: true,
          message: `Active lending positions:\n\n${lines.join("\n")}\n\nTotal supplied: ${stats.totalSupplied}\nEst. annual yield at 6% APY: ~${stats.projectedAnnualYield}\n\nTo withdraw, say "withdraw my ${positions[0].token}"`,
          actions: [],
        });
        return;
      }

      if (GREETING_RE.test(lower)) {
        res.json({
          success: false,
          message: "Hey! What would you like to do?\n\n• Send tokens to any email or wallet\n• Swap between STRK, ETH, USDC\n• Save tokens and earn yield\n• Check your positions\n\nJust tell me in plain English.",
          actions: [],
        });
        return;
      }

      if (HELP_RE.test(lower)) {
        res.json({ success: false, message: "Here's everything I can do — tap any command to try it:", actions: [], data: { type: "help" } });
        return;
      }

      const parsed = await parseCommand(message);

      if (parsed.actions.length === 0) {
        res.json({
          success: false,
          message: parsed.clarification ?? 'I didn\'t understand that. Try: "send 5 STRK to alice@gmail.com", "swap 1 ETH to USDC", or "save 10 USDC".',
          actions: [],
        });
        return;
      }

      const enriched = await Promise.all(
        parsed.actions.map((action) => enrichAction(action, walletAddress)),
      );

      const allReady = enriched.every((e) => e.ready);
      const readyCount = enriched.filter((e) => e.ready).length;
      const warnings = enriched.filter((e) => e.warning).map((e) => e.warning);

      const actionSummaries = enriched.map((e) => {
        const a = e.action;
        if (a.type === "send") return `send ${a.amount} ${a.token} to ${a.recipient}`;
        if (a.type === "swap") return `swap ${a.amount} ${a.token} → ${a.toToken}`;
        if (a.type === "save" || a.type === "invest" || a.type === "stake") return `save ${a.amount} ${a.token} on Vesu`;
        if (a.type === "unstake") return `withdraw ${a.amount} ${a.token} from Vesu`;
        if (a.type === "bridge") return `bridge ${a.amount} ${a.token} from ${a.fromChain} → Starknet`;
        if (a.type === "dca") return `DCA ${a.amount} ${a.token} → ${a.toToken} ${a.frequency === "P1D" ? "daily" : a.frequency === "P1M" ? "monthly" : "weekly"}`;
        if (a.type === "borrow") return `borrow ${a.amount} ${a.token} against ${a.collateralToken}`;
        if (a.type === "repay") return `repay ${a.amount} ${a.token}`;
        return `${a.type} ${a.amount} ${a.token}`;
      });

      let responseMessage: string;
      if (allReady) {
        responseMessage = enriched.length === 1
          ? `Got it. Confirm to ${actionSummaries[0]}.`
          : `${enriched.length} actions ready. Review and confirm each one.`;
      } else {
        responseMessage = readyCount > 0
          ? `${readyCount} of ${enriched.length} actions are ready.`
          : `Couldn't prepare that — see details below.`;
      }

      res.json({
        success: true,
        message: responseMessage,
        confidence: parsed.confidence,
        warnings: warnings.length ? warnings : undefined,
        actions: enriched.map((e) => ({
          ...e.action,
          ready: e.ready,
          recipientAddress: e.recipientAddress,
          needsEscrow: e.needsEscrow,
          warning: e.warning,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
