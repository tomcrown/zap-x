/**
 * POST /api/chat
 *
 * Unified chat endpoint. Parses a natural language command via Gemini,
 * handles pure backend actions (balance queries), and returns structured
 * results for frontend-executed actions (send, swap, stake, lend).
 *
 * Architecture note:
 *   On-chain actions require the user's wallet to sign — they MUST execute
 *   on the frontend via the Starkzap SDK. This endpoint handles:
 *     - Parsing the command
 *     - Executing read-only actions (balance)
 *     - Returning structured action plans for on-chain execution
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { parseCommand } from '../services/aiService.js';
import { lookupByIdentifier } from '../services/walletService.js';
import { ParsedAction } from '../models/types.js';
import getDb from '../db/database.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(500),
});

// ─── Balance helper ────────────────────────────────────────────────────────────

function getWalletBalances(walletAddress: string) {
  // Balances live on-chain — return instruction for frontend to fetch them
  // We can return the last known transaction history as context instead
  const db = getDb();
  const recent = db.prepare(`
    SELECT token, SUM(CASE WHEN sender_wallet = ? THEN -CAST(amount AS REAL) ELSE CAST(amount AS REAL) END) as net
    FROM transactions
    WHERE (sender_wallet = ? OR recipient_wallet = ?) AND status != 'failed'
    GROUP BY token
  `).all(walletAddress, walletAddress, walletAddress) as { token: string; net: number }[];

  return recent;
}

// ─── Action enrichment ─────────────────────────────────────────────────────────

/**
 * Enrich parsed actions with additional context:
 * - Resolve recipient identifiers to addresses when possible
 * - Flag escrow-needed actions
 * - Validate action is executable
 */
async function enrichAction(action: ParsedAction, senderWallet: string): Promise<{
  action: ParsedAction;
  ready: boolean;
  warning?: string;
  recipientAddress?: string;
  needsEscrow?: boolean;
}> {
  // Validate amount
  const amt = parseFloat(action.amount);
  if (isNaN(amt) || amt <= 0) {
    return { action, ready: false, warning: 'Invalid amount.' };
  }

  if (action.type === 'send') {
    if (!action.recipient) {
      return { action, ready: false, warning: 'No recipient specified.' };
    }

    // Prevent sending to self
    if (action.recipient.toLowerCase() === senderWallet.toLowerCase()) {
      return { action, ready: false, warning: 'Cannot send to yourself.' };
    }

    // Try resolving recipient
    const resolved = lookupByIdentifier(action.recipient);
    if (resolved?.walletAddress) {
      return {
        action,
        ready: true,
        recipientAddress: resolved.walletAddress,
        needsEscrow: false,
      };
    }

    // Email not found → will need escrow
    const isEmail = action.recipient.includes('@') && action.recipient.includes('.');
    const isAddress = action.recipient.startsWith('0x');
    if (isEmail) {
      return { action, ready: true, needsEscrow: true, warning: 'Recipient has no wallet — funds will be escrowed until they claim.' };
    }
    if (isAddress) {
      return { action, ready: true, recipientAddress: action.recipient };
    }

    return { action, ready: false, warning: `Could not resolve recipient "${action.recipient}".` };
  }

  if (action.type === 'swap') {
    if (!action.toToken) {
      return { action, ready: false, warning: 'No target token specified for swap.' };
    }
    if (action.token === action.toToken) {
      return { action, ready: false, warning: 'Cannot swap a token for itself.' };
    }
  }

  return { action, ready: true };
}

// ─── Route ─────────────────────────────────────────────────────────────────────

router.post('/', requireAuth as any, validate(chatSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { message } = req.body;
    const walletAddress = req.user!.walletAddress;

    // 1. Parse command via Gemini / local parser
    const parsed = await parseCommand(message);

    if (parsed.actions.length === 0) {
      res.json({
        success: false,
        message: parsed.clarification ?? 'Could not understand that command. Try: "send 2 STRK to user@email.com" or "swap 1 ETH to USDC".',
        parsed,
        actions: [],
      });
      return;
    }

    // 2. Handle pure read actions immediately
    const balanceAction = parsed.actions.find((a) => (a as any).type === 'balance');
    if (balanceAction || message.toLowerCase().match(/\b(balance|portfolio|holdings|how much)\b/)) {
      const balances = getWalletBalances(walletAddress);
      res.json({
        success: true,
        message: 'Here are your recent on-chain balances. Live balances are shown in your dashboard.',
        type: 'balance',
        data: { balances, walletAddress },
        parsed,
        actions: [],
      });
      return;
    }

    // 3. Enrich all actions with context
    const enriched = await Promise.all(
      parsed.actions.map((action) => enrichAction(action, walletAddress))
    );

    const allReady = enriched.every((e) => e.ready);
    const warnings = enriched.filter((e) => e.warning).map((e) => e.warning);

    // 4. Return enriched action plan for frontend execution
    res.json({
      success: true,
      message: allReady
        ? `Ready to execute ${enriched.length} action${enriched.length !== 1 ? 's' : ''}.`
        : `${enriched.filter((e) => e.ready).length} of ${enriched.length} actions ready.`,
      confidence: parsed.confidence,
      clarification: parsed.clarification,
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
