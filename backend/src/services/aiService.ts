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

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";
import {
  AIParseResult,
  ParsedAction,
  TokenSymbol,
  ActionType,
} from "../models/types.js";

const SUPPORTED_TOKENS: TokenSymbol[] = [
  "STRK",
  "ETH",
  "USDC",
  "USDT",
  "wBTC",
  "lBTC",
  "tBTC",
];
const SUPPORTED_ACTIONS: ActionType[] = [
  "send",
  "stake",
  "unstake",
  "swap",
  "save",
  "invest",
  "bridge",
  "dca",
  "borrow",
  "repay",
];

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (_genAI) return _genAI;
  if (!config.gemini.apiKey)
    throw new Error("GEMINI_API_KEY is not configured.");
  _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  return _genAI;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the AI engine for Zap-X, a DeFi wallet on Starknet. You parse natural language commands into structured JSON actions.

Supported tokens: ${SUPPORTED_TOKENS.join(", ")}
Supported actions: ${SUPPORTED_ACTIONS.join(", ")}

Action schemas:
- send:    { type: "send",    amount: string, token: TokenSymbol, recipient: string (email, @username, or 0x address) }
- swap:    { type: "swap",    amount: string, token: TokenSymbol, toToken: TokenSymbol }
- save:    { type: "save",    amount: string, token: TokenSymbol }
- invest:  { type: "invest",  amount: string, token: TokenSymbol }
- stake:   { type: "stake",   amount: string, token: TokenSymbol }
- unstake: { type: "unstake", amount: string, token: TokenSymbol }
- bridge:  { type: "bridge",  amount: string, token: TokenSymbol, fromChain: "ethereum" }
- dca:     { type: "dca",     amount: string, token: TokenSymbol, toToken: TokenSymbol, frequency: string (ISO 8601: "P1D"=daily, "P7D"=weekly, "P1M"=monthly), cycles?: number }
- borrow:  { type: "borrow",  amount: string, token: TokenSymbol, collateralToken: TokenSymbol }
- repay:   { type: "repay",   amount: string, token: TokenSymbol, collateralToken: TokenSymbol }

Rules:
1. Extract ALL actions from the command. Users can chain multiple.
2. Preserve recipients exactly — emails, @handles, 0x addresses.
3. "save", "earn", "lend", "supply", "deposit" → use "save" type.
4. "withdraw", "unstake", "pull out", "take out", "redeem" → use "unstake" type. If no amount is given, set amount to "0".
5. BTC / Bitcoin → "wBTC" unless user says lBTC or tBTC.
6. Ambiguous token → default "STRK".
7. Missing amount → set "0" and note in clarification.
8. "bridge X TOKEN from Ethereum" → type "bridge", fromChain "ethereum".
9. "bridge X and send to email" → two actions: bridge then send.
10. "bridge X and save it" → two actions: bridge then save.
11. DCA frequency: "daily"→"P1D", "weekly"/"every week"/"every monday"→"P7D", "monthly"→"P1M". "buy X USDC every week" → dca with token=STRK (sell), toToken=USDC (buy), amount=X.
12. "borrow X TOKEN" → borrow, default collateralToken="STRK" unless user specifies.
13. "repay X TOKEN" → repay, default collateralToken="STRK".
14. Return ONLY valid JSON. No markdown fences, no explanation text.

Response format:
{
  "actions": [ ...parsed actions... ],
  "confidence": 0.0–1.0,
  "clarification": "optional — only include if something is ambiguous or missing"
}
`;

// ─── Parse Command ─────────────────────────────────────────────────────────────

export async function parseCommand(userInput: string): Promise<AIParseResult> {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return {
      actions: [],
      original: userInput,
      confidence: 0,
      clarification: "Empty input.",
    };
  }

  const localResult = tryLocalParse(trimmed);
  if (localResult) return localResult;

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: SYSTEM_PROMPT,
    });

    const prompt = `Parse this command:\n"${trimmed}"`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonText = text
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(jsonText) as {
      actions: ParsedAction[];
      confidence: number;
      clarification?: string;
    };
    const validatedActions = (parsed.actions ?? []).filter(validateAction);

    return {
      actions: validatedActions,
      original: userInput,
      confidence: parsed.confidence ?? 0.8,
      clarification: parsed.clarification,
    };
  } catch (err) {
    console.error("[AIService] Gemini parse failed:", err);
    return {
      actions: [],
      original: userInput,
      confidence: 0,
      clarification:
        'I couldn\'t parse that. Try something like "send 5 STRK to tony@gmail.com" or "swap 1 ETH to USDC".',
    };
  }
}

// ─── Local Fast Parser ─────────────────────────────────────────────────────────

const LOCAL_SEND_RE =
  /^(?:send|transfer|zap)\s+([\d.]+)\s*(STRK|ETH|USDC|USDT|wBTC|BTC|lBTC|tBTC)\s+(?:to\s+)?(@[\w]+|[\w._%+-]+@[\w.-]+\.[A-Z]{2,}|0x[0-9a-fA-F]+)(?:\s+(.+))?$/i;

const LOCAL_SWAP_RE =
  /^(?:swap|exchange|convert)\s+([\d.]+)\s*(STRK|ETH|USDC|USDT|wBTC|BTC)\s+(?:to|for)\s+(STRK|ETH|USDC|USDT|wBTC|BTC)$/i;

const LOCAL_STAKE_RE =
  /^(?:stake|lock|save|lend|earn|supply|deposit|invest)\s+([\d.]+)\s*(STRK|ETH|USDC|USDT)$/i;

const LOCAL_UNSTAKE_RE =
  /^(?:unstake|unlock|withdraw|pull\s+out|take\s+out|redeem)\s+(?:my\s+)?(?:([\d.]+)\s+)?(STRK|ETH|USDC|USDT)(?:\s+(?:position|funds|savings|deposit|balance))?$/i;

const LOCAL_BRIDGE_RE =
  /^bridge\s+([\d.]+)\s*(USDC|ETH|STRK|USDT|wBTC)\s+from\s+(?:ethereum|eth)(?:\s+to\s+starknet)?$/i;

const LOCAL_DCA_RE =
  /^(?:buy|dca|set\s+up\s+(?:a\s+)?dca(?:\s+for)?)\s+([\d.]+)\s*(USDC|ETH|STRK|USDT|wBTC)\s+(?:worth\s+of\s+(STRK|ETH|USDC|USDT|wBTC)\s+)?(?:every\s+)?(daily|weekly|monthly|every\s+day|every\s+week|every\s+monday|every\s+month)$/i;

const LOCAL_BORROW_RE =
  /^borrow\s+([\d.]+)\s*(STRK|ETH|USDC|USDT)(?:\s+(?:using|against|with)\s+(STRK|ETH|USDC|USDT))?$/i;

const LOCAL_REPAY_RE =
  /^repay\s+([\d.]+)\s*(STRK|ETH|USDC|USDT)(?:\s+(?:using|with|from)\s+(STRK|ETH|USDC|USDT))?$/i;

function tryLocalParse(input: string): AIParseResult | null {
  let m: RegExpMatchArray | null;

  m = input.match(LOCAL_SEND_RE);
  if (m) {
    return {
      actions: [
        {
          type: "send",
          amount: m[1],
          token: normaliseToken(m[2]),
          recipient: m[3],
          note: m[4],
        },
      ],
      original: input,
      confidence: 0.97,
    };
  }

  m = input.match(LOCAL_SWAP_RE);
  if (m) {
    return {
      actions: [
        {
          type: "swap",
          amount: m[1],
          token: normaliseToken(m[2]),
          toToken: normaliseToken(m[3]),
        },
      ],
      original: input,
      confidence: 0.97,
    };
  }

  m = input.match(LOCAL_STAKE_RE);
  if (m) {
    return {
      actions: [{ type: "save", amount: m[1], token: normaliseToken(m[2]) }],
      original: input,
      confidence: 0.97,
    };
  }

  m = input.match(LOCAL_UNSTAKE_RE);
  if (m) {
    return {
      actions: [{ type: "unstake", amount: m[1] ?? "0", token: normaliseToken(m[2]) }],
      original: input,
      confidence: 0.97,
    };
  }

  m = input.match(LOCAL_BRIDGE_RE);
  if (m) {
    return {
      actions: [{ type: "bridge", amount: m[1], token: normaliseToken(m[2]), fromChain: "ethereum" }],
      original: input,
      confidence: 0.97,
    };
  }

  m = input.match(LOCAL_DCA_RE);
  if (m) {
    const freqRaw = m[4].toLowerCase().replace(/\s+/g, " ");
    const frequency =
      freqRaw === "daily" || freqRaw === "every day" ? "P1D" :
      freqRaw === "monthly" || freqRaw === "every month" ? "P1M" : "P7D";
    const buyToken = m[3] ? normaliseToken(m[3]) : normaliseToken(m[2]);
    // "buy 10 USDC every week" → sell STRK to buy USDC; token=sell, toToken=buy
    const sellToken = buyToken === "STRK" ? "USDC" as const : "STRK" as const;
    return {
      actions: [{ type: "dca", amount: m[1], token: sellToken, toToken: buyToken, frequency }],
      original: input,
      confidence: 0.95,
    };
  }

  m = input.match(LOCAL_BORROW_RE);
  if (m) {
    return {
      actions: [{ type: "borrow", amount: m[1], token: normaliseToken(m[2]), collateralToken: m[3] ? normaliseToken(m[3]) : "STRK" }],
      original: input,
      confidence: 0.97,
    };
  }

  m = input.match(LOCAL_REPAY_RE);
  if (m) {
    return {
      actions: [{ type: "repay", amount: m[1], token: normaliseToken(m[2]), collateralToken: m[3] ? normaliseToken(m[3]) : "STRK" }],
      original: input,
      confidence: 0.97,
    };
  }

  return null;
}

function normaliseToken(raw: string): TokenSymbol {
  const upper = raw.toUpperCase();
  if (upper === "BTC") return "wBTC";
  if (SUPPORTED_TOKENS.includes(upper as TokenSymbol))
    return upper as TokenSymbol;
  return "STRK";
}

function validateAction(action: unknown): action is ParsedAction {
  if (typeof action !== "object" || action === null) return false;
  const a = action as Record<string, unknown>;
  if (!SUPPORTED_ACTIONS.includes(a.type as ActionType)) return false;
  if (typeof a.amount !== "string" || isNaN(parseFloat(a.amount))) return false;
  if (!SUPPORTED_TOKENS.includes(a.token as TokenSymbol)) return false;
  return true;
}
