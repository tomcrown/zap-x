/**
 * POST /api/chat
 *
 * Unified chat endpoint. Parses a natural language command via Gemini,
 * handles pure read-only queries (balance, history, positions), and returns
 * structured action plans for frontend-executed on-chain operations.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { parseCommand } from '../services/aiService.js';
import { lookupByIdentifier } from '../services/walletService.js';
import { ParsedAction } from '../models/types.js';
import { getActiveLendingPositions, getLendingStats } from '../services/lendingService.js';
import getDb from '../db/database.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(500),
});

// ─── Read-only helpers ─────────────────────────────────────────────────────────

function getTransactionHistory(walletAddress: string) {
  const db = getDb();
  return db.prepare(`
    SELECT token, amount, recipient_identifier, sender_wallet, status, tx_hash, created_at
    FROM transactions
    WHERE (sender_wallet = ? OR recipient_wallet = ?) AND status != 'failed'
    ORDER BY created_at DESC
    LIMIT 5
  `).all(walletAddress, walletAddress) as {
    token: string; amount: string; recipient_identifier: string;
    sender_wallet: string; status: string; tx_hash: string | null; created_at: string;
  }[];
}

// ─── Intent detection ──────────────────────────────────────────────────────────

const BALANCE_RE   = /\b(balance|portfolio|holdings|how much|what.*(have|got))\b/i;
const HISTORY_RE   = /\b(histor|recent|transaction|transfer|sent|received|activity)\b/i;
const POSITION_RE  = /\b(lending|position|earning|yield|supplied|deposited|lend|vesu|saving|invested)\b/i;
const HELP_RE      = /\b(what|help|can you|how|capabilities|commands)\b/i;
const GREETING_RE  = /^(hi|hello|hey|yo|sup|gm|hola)[!. ]*$/i;

// ─── Action enrichment ─────────────────────────────────────────────────────────

async function enrichAction(action: ParsedAction, senderWallet: string): Promise<{
  action: ParsedAction;
  ready: boolean;
  warning?: string;
  recipientAddress?: string;
  needsEscrow?: boolean;
}> {
  const amt = parseFloat(action.amount);
  if (isNaN(amt) || amt <= 0) {
    // For unstake with 0/missing amount, look up the active position and use its full amount
    if (action.type === 'unstake') {
      const positions = getActiveLendingPositions(senderWallet);
      const pos = positions.find((p) => p.token === action.token && p.status === 'active');
      if (pos) {
        return { action: { ...action, amount: pos.supplied_amount }, ready: true };
      }
      return { action, ready: false, warning: `No active ${action.token} lending position found.` };
    }
    return { action, ready: false, warning: 'Invalid amount.' };
  }

  if (action.type === 'send') {
    if (!action.recipient) {
      return { action, ready: false, warning: 'No recipient specified.' };
    }
    if (action.recipient.toLowerCase() === senderWallet.toLowerCase()) {
      return { action, ready: false, warning: 'Cannot send to yourself.' };
    }

    const resolved = lookupByIdentifier(action.recipient);
    if (resolved?.walletAddress) {
      return { action, ready: true, recipientAddress: resolved.walletAddress, needsEscrow: false };
    }

    const isEmail   = action.recipient.includes('@') && action.recipient.includes('.');
    const isAddress = action.recipient.startsWith('0x');

    if (isEmail) {
      return {
        action, ready: true, needsEscrow: true,
        warning: 'Recipient has no Zap-X wallet — funds will be escrowed and they\'ll receive a claim link by email.',
      };
    }
    if (isAddress) {
      return { action, ready: true, recipientAddress: action.recipient };
    }

    return { action, ready: false, warning: `Could not resolve "${action.recipient}". Use an email, @username, or 0x address.` };
  }

  if (action.type === 'swap') {
    if (!action.toToken) return { action, ready: false, warning: 'No target token specified for swap.' };
    if (action.token === action.toToken) return { action, ready: false, warning: 'Cannot swap a token for itself.' };
  }

  return { action, ready: true };
}

// ─── Route ─────────────────────────────────────────────────────────────────────

router.post('/', requireAuth as any, validate(chatSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { message } = req.body;
    const walletAddress = req.user!.walletAddress;
    const lower = message.toLowerCase().trim();

    // ── 1. Read-only intent checks FIRST (before Gemini) ──────────────────────
    // These are checked directly from the raw message — no AI parse needed.

    if (BALANCE_RE.test(lower)) {
      res.json({
        success: true,
        message: 'Your live balances are shown at the top of the screen. Tap the STRK amount to see all tokens.',
        actions: [],
      });
      return;
    }

    if (HISTORY_RE.test(lower)) {
      const txs = getTransactionHistory(walletAddress);
      if (txs.length === 0) {
        res.json({ success: true, message: 'No transactions yet. Try sending some STRK!', actions: [] });
        return;
      }
      const lines = txs.map((tx) => {
        const isSent = tx.sender_wallet === walletAddress;
        const sign = isSent ? '-' : '+';
        const who  = isSent ? tx.recipient_identifier : tx.sender_wallet;
        const shortWho = who.length > 20 ? `${who.slice(0, 12)}…${who.slice(-6)}` : who;
        const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${sign}${tx.amount} ${tx.token}  →  ${shortWho}  (${date})`;
      });
      res.json({
        success: true,
        message: `Last ${txs.length} transaction${txs.length !== 1 ? 's' : ''}:\n\n${lines.join('\n')}`,
        actions: [],
      });
      return;
    }

    if (POSITION_RE.test(lower) && !lower.match(/\b(lend|save|invest|supply|deposit|withdraw|unstake|pull)\b.*[\d]/)) {
      const positions = getActiveLendingPositions(walletAddress);
      const stats = getLendingStats(walletAddress);
      if (positions.length === 0) {
        res.json({
          success: true,
          message: 'You have no active lending positions. Try "lend 10 USDC" to start earning yield on Vesu.',
          actions: [],
        });
        return;
      }
      const lines = positions.map((p) =>
        `${p.token}  ${parseFloat(p.supplied_amount).toFixed(4)} supplied`
      );
      res.json({
        success: true,
        message: `Active lending positions:\n\n${lines.join('\n')}\n\nTotal supplied: ${stats.totalSupplied}\nEst. annual yield at 6% APY: ~${stats.projectedAnnualYield}\n\nTo withdraw, say "withdraw my ${positions[0].token}"`,
        actions: [],
      });
      return;
    }

    if (GREETING_RE.test(lower)) {
      res.json({
        success: false,
        message: 'Hey! What would you like to do?\n\n• Send tokens to any email or wallet\n• Swap between STRK, ETH, USDC\n• Lend tokens and earn yield\n• Check your positions\n\nJust tell me in plain English.',
        actions: [],
      });
      return;
    }

    if (HELP_RE.test(lower)) {
      res.json({
        success: false,
        message: 'Here\'s what I can do:\n\n→ Send — "send 5 STRK to alice@gmail.com"\n→ Send to email — recipient gets a claim link even without a wallet\n→ Swap — "swap 1 ETH to USDC"\n→ Lend & earn — "lend 50 USDC"\n→ Withdraw — "withdraw my USDC position"\n→ Check positions — "show my lending positions"\n→ History — "show recent transactions"\n\nAll transactions are gasless. AVNU covers your fees.',
        actions: [],
      });
      return;
    }

    // ── 2. Parse command via Gemini / local parser ─────────────────────────────
    const parsed = await parseCommand(message);

    if (parsed.actions.length === 0) {
      res.json({
        success: false,
        message: parsed.clarification ?? 'I didn\'t understand that. Try: "send 5 STRK to alice@gmail.com", "swap 1 ETH to USDC", or "lend 10 USDC".',
        actions: [],
      });
      return;
    }

    // ── 3. Enrich all parsed actions ───────────────────────────────────────────
    const enriched = await Promise.all(
      parsed.actions.map((action) => enrichAction(action, walletAddress))
    );

    const allReady  = enriched.every((e) => e.ready);
    const readyCount = enriched.filter((e) => e.ready).length;
    const warnings  = enriched.filter((e) => e.warning).map((e) => e.warning);

    const actionSummaries = enriched.map((e) => {
      const a = e.action;
      if (a.type === 'send')    return `send ${a.amount} ${a.token} to ${a.recipient}`;
      if (a.type === 'swap')    return `swap ${a.amount} ${a.token} → ${(a as any).toToken}`;
      if (a.type === 'save' || a.type === 'invest' || a.type === 'stake')
                                return `lend ${a.amount} ${a.token} on Vesu`;
      if (a.type === 'unstake') return `withdraw ${a.amount} ${a.token} from Vesu`;
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
});

export default router;
