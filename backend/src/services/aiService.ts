/**
 * AIService — Natural Language Command Parser
 *
 * Uses Google Gemini to parse free-form user commands into structured
 * blockchain actions. Examples:
 *   "Send 5 STRK to @tolu and stake 2 STRK"
 *   → [{ type: 'send', amount: '5', token: 'STRK', recipient: '@tolu' },
 *      { type: 'stake', amount: '2', token: 'STRK' }]
 *
 *   "Swap 100 USDC for STRK then send 3 STRK to alice@example.com"
 *   → [{ type: 'swap', amount: '100', token: 'USDC', toToken: 'STRK' },
 *      { type: 'send', amount: '3', token: 'STRK', recipient: 'alice@example.com' }]
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { AIParseResult, ParsedAction, TokenSymbol, ActionType } from '../models/types.js';

const SUPPORTED_TOKENS: TokenSymbol[] = ['STRK', 'ETH', 'USDC', 'USDT', 'wBTC', 'lBTC', 'tBTC'];
const SUPPORTED_ACTIONS: ActionType[] = ['send', 'stake', 'unstake', 'swap', 'save', 'invest'];

// Lazy-init Gemini client
let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (_genAI) return _genAI;
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  return _genAI;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are an AI assistant for Zap-X, a DeFi payment application on Starknet.
Your task is to parse user natural language commands into structured JSON actions.

Supported tokens: ${SUPPORTED_TOKENS.join(', ')}
Supported action types: ${SUPPORTED_ACTIONS.join(', ')}

Action schemas:
- send:    { type: "send",    amount: string, token: TokenSymbol, recipient: string, note?: string }
- stake:   { type: "stake",   amount: string, token: TokenSymbol }
- unstake: { type: "unstake", amount: string, token: TokenSymbol }
- swap:    { type: "swap",    amount: string, token: TokenSymbol, toToken: TokenSymbol }
- save:    { type: "save",    amount: string, token: TokenSymbol }
- invest:  { type: "invest",  amount: string, token: TokenSymbol }

Rules:
1. Extract ALL actions from the user's command.
2. For recipients: preserve @username, email addresses, or 0x addresses exactly.
3. If BTC / Bitcoin is mentioned as a token, use "wBTC" unless user specifies lBTC or tBTC.
4. If the token is ambiguous, default to "STRK".
5. If the amount is ambiguous or missing, set amount to "0" and note this in clarification.
6. Return ONLY valid JSON — no markdown fences, no explanation.

Response format:
{
  "actions": [ ...parsed actions... ],
  "confidence": 0.0–1.0,
  "clarification": "optional message if ambiguous"
}
`;

// ─── Parse Command ─────────────────────────────────────────────────────────────

export async function parseCommand(userInput: string): Promise<AIParseResult> {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return { actions: [], original: userInput, confidence: 0, clarification: 'Empty input.' };
  }

  // Fast local parse for simple single-action commands (saves API calls)
  const localResult = tryLocalParse(trimmed);
  if (localResult) return localResult;

  // Full Gemini parse
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: SYSTEM_PROMPT,
    });

    const prompt = `Parse this user command into structured actions:\n"${trimmed}"`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip accidental markdown fences
    const jsonText = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    const parsed = JSON.parse(jsonText) as { actions: ParsedAction[]; confidence: number; clarification?: string };

    // Validate actions
    const validatedActions = (parsed.actions ?? []).filter(validateAction);

    return {
      actions: validatedActions,
      original: userInput,
      confidence: parsed.confidence ?? 0.8,
      clarification: parsed.clarification,
    };
  } catch (err) {
    console.error('[AIService] Gemini parse failed:', err);
    return {
      actions: [],
      original: userInput,
      confidence: 0,
      clarification: 'Could not parse your command. Please try rephrasing.',
    };
  }
}

// ─── Local Fast Parser ─────────────────────────────────────────────────────────

const LOCAL_SEND_RE =
  /^(?:send|transfer|zap)\s+([\d.]+)\s*(STRK|ETH|USDC|USDT|wBTC|BTC|lBTC|tBTC)\s+(?:to\s+)?(@[\w]+|[\w._%+-]+@[\w.-]+\.[A-Z]{2,}|0x[0-9a-fA-F]+)(?:\s+(.+))?$/i;

const LOCAL_STAKE_RE =
  /^(?:stake|lock)\s+([\d.]+)\s*(STRK|ETH|USDC|USDT)$/i;

const LOCAL_UNSTAKE_RE =
  /^(?:unstake|unlock|withdraw)\s+([\d.]+)\s*(STRK|ETH|USDC|USDT)$/i;

function tryLocalParse(input: string): AIParseResult | null {
  let m: RegExpMatchArray | null;

  m = input.match(LOCAL_SEND_RE);
  if (m) {
    const token = normaliseToken(m[2]);
    return {
      actions: [{ type: 'send', amount: m[1], token, recipient: m[3], note: m[4] }],
      original: input,
      confidence: 0.95,
    };
  }

  m = input.match(LOCAL_STAKE_RE);
  if (m) {
    return {
      actions: [{ type: 'stake', amount: m[1], token: normaliseToken(m[2]) }],
      original: input,
      confidence: 0.95,
    };
  }

  m = input.match(LOCAL_UNSTAKE_RE);
  if (m) {
    return {
      actions: [{ type: 'unstake', amount: m[1], token: normaliseToken(m[2]) }],
      original: input,
      confidence: 0.95,
    };
  }

  return null;
}

function normaliseToken(raw: string): TokenSymbol {
  const upper = raw.toUpperCase();
  if (upper === 'BTC') return 'wBTC';
  if (SUPPORTED_TOKENS.includes(upper as TokenSymbol)) return upper as TokenSymbol;
  return 'STRK';
}

function validateAction(action: unknown): action is ParsedAction {
  if (typeof action !== 'object' || action === null) return false;
  const a = action as Record<string, unknown>;
  if (!SUPPORTED_ACTIONS.includes(a.type as ActionType)) return false;
  if (typeof a.amount !== 'string' || isNaN(parseFloat(a.amount))) return false;
  if (!SUPPORTED_TOKENS.includes(a.token as TokenSymbol)) return false;
  return true;
}
