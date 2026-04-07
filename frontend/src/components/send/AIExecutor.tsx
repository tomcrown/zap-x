/**
 * AIExecutor — the entire product UI.
 * Chat interface that parses natural language, enriches actions via backend,
 * and executes them on-chain through the Starkzap SDK.
 */

import { useState, useRef, useEffect } from "react";
import {
  chatApi,
  transferApi,
  swapApi,
  lendingApi,
  dcaApi,
  bridgeApi,
} from "../../lib/api.js";
import {
  executeTransfer,
  executeSwap,
  executeLendingDeposit,
  executeLendingWithdraw,
  executeDcaCreate,
  executeDcaCancel,
  executeBorrow,
  executeRepay,
  getBorrowLimit,
  getBridgeTokens,
  connectEthereumWallet,
  executeBridge,
  getDcaOrders,
} from "../../lib/starkzap.js";
import { useWallet } from "../../contexts/WalletContext.js";
import { useToast } from "../../contexts/ToastContext.js";
import type { ParsedAction, TokenSymbol } from "../../types/index.js";

type EnrichedAction = ParsedAction & {
  ready: boolean;
  recipientAddress?: string;
  needsEscrow?: boolean;
  warning?: string;
  _done?: boolean;
};

type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: number;
  role: MessageRole;
  text: string;
  actions?: EnrichedAction[];
  executing?: boolean;
  done?: boolean;
}

// ─── Quick Commands ────────────────────────────────────────────────────────────

const QUICK_COMMANDS = [
  {
    label: "Send",
    icon: (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
        />
      </svg>
    ),
    fill: "Send  STRK to ",
    send: false,
  },
  {
    label: "Swap",
    icon: (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
    fill: "Swap  STRK to USDC",
    send: false,
  },
  {
    label: "Save",
    icon: (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1"
        />
      </svg>
    ),
    fill: "Save  STRK",
    send: false,
  },

  {
    label: "History",
    icon: (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    ),
    fill: "Show my recent transactions",
    send: true,
  },
  {
    label: "Help",
    icon: (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    fill: "What can you do?",
    send: true,
  },
];

const TOKEN_DISPLAY = ["STRK", "ETH", "USDC", "wBTC"] as TokenSymbol[];

let _msgId = 0;
function nextId() {
  return ++_msgId;
}

// ─── Portfolio Bar ─────────────────────────────────────────────────────────────

function PortfolioBar() {
  const { walletAddress, balances, balancesLoading, refreshBalances } =
    useWallet();
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const strkBal = parseFloat(balances["STRK"] ?? "0");
  const ethBal = parseFloat(balances["ETH"] ?? "0");
  const usdcBal = parseFloat(balances["USDC"] ?? "0");
  const btcBal = parseFloat(balances["wBTC"] ?? "0");

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
    : "";

  return (
    <div className="border-b border-surface-border bg-surface-card/50 px-4 sm:px-8 py-5">
      {/* Primary balance */}
      <div className="text-center mb-5">
        <p className="text-xs font-mono text-zinc-700 uppercase tracking-widest mb-1">
          STRK Balance
        </p>
        <div className="flex items-end justify-center gap-2">
          {balancesLoading ? (
            <div className="h-12 w-32 bg-zinc-900 rounded-lg animate-pulse" />
          ) : (
            <>
              <span className="text-3xl sm:text-4xl font-bold text-white font-mono leading-none">
                {strkBal.toFixed(4)}
              </span>
              <span className="text-xl text-accent font-mono font-semibold mb-1">
                STRK
              </span>
            </>
          )}
        </div>
      </div>

      {/* Wallet address + actions */}
      <div className="flex items-center justify-center gap-3">
        {walletAddress && (
          <button
            onClick={copyAddress}
            title="Copy wallet address"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-surface-border hover:border-zinc-700 transition-colors group"
          >
            <svg
              className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span className="font-mono text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">
              {copied ? "copied ✓" : shortAddr}
            </span>
          </button>
        )}
        <button
          onClick={refreshBalances}
          disabled={balancesLoading}
          title="Refresh balances"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface border border-surface-border hover:border-zinc-700 transition-colors text-zinc-700 hover:text-zinc-400"
        >
          <svg
            className={`w-3.5 h-3.5 ${balancesLoading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AIExecutor() {
  const { walletAddress, balances, refreshBalances, profile } = useWallet();
  const { toast: showToast } = useToast();

  const greeting = profile?.username ? `@${profile.username}` : "there";

  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "assistant",
      text: `Hey ${greeting} — ready to move assets. Send to emails or wallet addresses, swap, save, or just ask me anything.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (msg: Omit<Message, "id">) =>
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);

  const updateMessage = (id: number, patch: Partial<Message>) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    addMessage({ role: "user", text });

    try {
      const result = await chatApi.send(text);
      if (!result.success || result.actions.length === 0) {
        addMessage({ role: "assistant", text: result.message });
        return;
      }
      const msgId = nextId();
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: "assistant",
          text: result.message,
          actions: result.actions as EnrichedAction[],
        },
      ]);
    } catch (err: any) {
      addMessage({
        role: "assistant",
        text: `Something went wrong: ${err.message}`,
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleExecuteAction = async (
    msgId: number,
    action: EnrichedAction,
    actionIndex: number,
  ) => {
    if (!walletAddress) return;
    updateMessage(msgId, { executing: true });

    try {
      let txHash: string | undefined;
      let resultText = "";

      switch (action.type) {
        case "send": {
          const prep = await transferApi.prepare({
            senderWallet: walletAddress,
            recipient: action.recipient!,
            amount: action.amount,
            token: action.token,
            gasless: true,
          });
          txHash = await executeTransfer({
            toAddress: prep.toAddress,
            amount: action.amount,
            token: action.token,
            gasless: true,
          });
          await transferApi.confirm({
            senderWallet: walletAddress,
            recipient: action.recipient!,
            amount: action.amount,
            token: action.token,
            txHash,
            recipientEmail: prep.recipientEmail,
            needsEscrow: prep.needsEscrow,
          });
          resultText = prep.needsEscrow
            ? `${action.amount} ${action.token} escrowed — claim link sent to ${action.recipient}`
            : `${action.amount} ${action.token} sent to ${action.recipient}`;
          break;
        }
        case "swap": {
          txHash = await executeSwap(
            action.token,
            action.toToken as TokenSymbol,
            action.amount,
            100n,
            true,
          );
          await swapApi.record({
            tokenIn: action.token,
            tokenOut: action.toToken!,
            amountIn: action.amount,
            amountOut: "0",
            txHash,
            provider: "avnu",
          });
          resultText = `Swapped ${action.amount} ${action.token} → ${action.toToken}`;
          break;
        }
        case "save":
        case "invest":
        case "stake": {
          txHash = await executeLendingDeposit(
            action.token,
            action.amount,
            true,
          );
          await lendingApi.deposit({
            token: action.token,
            amount: action.amount,
            txHash,
          });
          resultText = `${action.amount} ${action.token} supplied to Vesu — earning yield`;
          break;
        }
        case "unstake": {
          const positions = await lendingApi.positions();
          const pos = positions.find(
            (p) => p.token === action.token && p.status === "active",
          );
          if (!pos)
            throw new Error(`No active ${action.token} position found.`);
          txHash = await executeLendingWithdraw(
            action.token,
            action.amount,
            true,
          );
          await lendingApi.withdraw(pos.id, txHash);
          resultText = `${action.amount} ${action.token} withdrawn from Vesu`;
          break;
        }
        case "bridge": {
          // Step 1: Connect MetaMask + auto-switch to correct Ethereum network
          const ethWallet = await connectEthereumWallet();
          // Step 2: Fetch supported bridge tokens and find the requested one
          const bridgeTokens = await getBridgeTokens();
          const bridgeToken = bridgeTokens.find(
            (t) => t.symbol.toUpperCase() === action.token.toUpperCase(),
          );
          if (!bridgeToken)
            throw new Error(
              `${action.token} is not available for bridging from Ethereum on this network. ` +
                `Supported: ${bridgeTokens.map((t) => t.symbol).join(", ")}`,
            );
          // Step 3: Execute the bridge deposit
          const ethTxHash = await executeBridge(
            bridgeToken,
            action.amount,
            walletAddress,
            ethWallet,
          );
          await bridgeApi.record({
            token: action.token,
            amount: action.amount,
            fromChain: action.fromChain ?? "ethereum",
            txHash: ethTxHash,
          });
          txHash = ethTxHash;
          resultText = `${action.amount} ${action.token} bridge initiated from Ethereum → Starknet. Funds arrive in ~10 min.`;
          break;
        }
        case "dca": {
          const dcaResult = await executeDcaCreate({
            sellToken: action.token,
            buyToken: action.toToken as any,
            amountPerCycle: action.amount,
            frequency: action.frequency ?? "P7D",
            cycles: action.cycles,
          });
          await dcaApi.record({
            sellToken: action.token,
            buyToken: action.toToken!,
            amountPerCycle: action.amount,
            frequency: action.frequency ?? "P7D",
            txHash: dcaResult.txHash,
            orderAddress: dcaResult.orderAddress,
          });
          txHash = dcaResult.txHash;
          const freqLabel =
            action.frequency === "P1D"
              ? "daily"
              : action.frequency === "P1M"
                ? "monthly"
                : "weekly";
          resultText = `DCA set up — selling ${action.amount} ${action.token} → ${action.toToken} ${freqLabel}`;
          break;
        }
        case "borrow": {
          const collateral = (action.collateralToken ?? "STRK") as any;
          const limit = await getBorrowLimit(collateral, action.token);
          if (parseFloat(limit) < parseFloat(action.amount)) {
            throw new Error(
              `Borrow limit is ${parseFloat(limit).toFixed(4)} ${action.token}. You requested ${action.amount}.`,
            );
          }
          txHash = await executeBorrow(
            collateral,
            action.token,
            action.amount,
            true,
          );
          resultText = `Borrowed ${action.amount} ${action.token} against ${collateral} collateral`;
          break;
        }
        case "repay": {
          const collateral = (action.collateralToken ?? "STRK") as any;
          txHash = await executeRepay(
            collateral,
            action.token,
            action.amount,
            true,
          );
          resultText = `Repaid ${action.amount} ${action.token}`;
          break;
        }
        default:
          throw new Error(`Unknown action: ${action.type}`);
      }

      // Toast is the primary notification — clickable link to Starkscan
      showToast({ type: "success", title: resultText, txHash });
      refreshBalances();

      // Mark action done inline; no extra chat message (toast handles it)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.actions) return m;
          const newActions = m.actions.map((a, i) =>
            i === actionIndex ? { ...a, _done: true } : a,
          );
          return {
            ...m,
            actions: newActions,
            executing: false,
            done: newActions.every((a) => a._done),
          };
        }),
      );
    } catch (err: any) {
      updateMessage(msgId, { executing: false });
      // Parse common SDK errors into friendly messages
      let errMsg = err.message ?? "Unknown error";
      if (
        errMsg.includes("paymaster") ||
        errMsg.includes("gas") ||
        errMsg.includes("fee")
      ) {
        const isLending =
          action.type === "unstake" ||
          action.type === "save" ||
          action.type === "invest" ||
          action.type === "stake";
        errMsg = isLending
          ? "Transaction failed — Vesu lending on Sepolia may not support this token, or the paymaster couldn't cover gas. Try with STRK."
          : "Transaction failed — make sure you have STRK to cover gas, or the paymaster may not support this token pair on Sepolia.";
      } else if (
        errMsg.includes("insufficient") ||
        errMsg.includes("balance")
      ) {
        errMsg = `Insufficient balance for this transaction.`;
      }
      showToast({
        type: "error",
        title: "Transaction failed",
        message: errMsg,
      });
    }
  };

  const handleExecuteAll = async (msgId: number, actions: EnrichedAction[]) => {
    const ready = actions.filter((a) => a.ready && !a._done);
    for (let i = 0; i < ready.length; i++) {
      await handleExecuteAction(msgId, ready[i], actions.indexOf(ready[i]));
    }
  };

  const handleQuickCommand = (cmd: (typeof QUICK_COMMANDS)[0]) => {
    if (cmd.send) {
      handleSend(cmd.fill);
    } else {
      setInput(cmd.fill);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Portfolio bar ───────────────────────────────────────────────── */}
      <PortfolioBar />

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 space-y-5 max-w-3xl mx-auto w-full">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            balances={balances}
            onExecuteAction={(action, idx) =>
              handleExecuteAction(msg.id, action, idx)
            }
            onExecuteAll={(actions) => handleExecuteAll(msg.id, actions)}
          />
        ))}

        {loading && (
          <div className="flex items-center gap-1.5 pl-10">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-zinc-600 animate-blink"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick commands + input ───────────────────────────────────────── */}
      <div className="border-t border-surface-border bg-surface">
        {/* Quick command chips */}
        <div className="px-4 sm:px-8 pt-3 pb-2 flex gap-2 flex-wrap max-w-3xl mx-auto w-full">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => handleQuickCommand(cmd)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card border border-surface-border text-zinc-600 hover:text-zinc-200 hover:border-zinc-700 transition-all duration-150 text-xs font-mono disabled:opacity-30"
            >
              {cmd.icon}
              {cmd.label}
            </button>
          ))}
        </div>

        {/* Text input */}
        <div className="px-4 sm:px-8 pb-4 flex gap-3 max-w-3xl mx-auto w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder='e.g. "send 5 STRK to alice@gmail.com" or "swap 1 STRK to USDC"'
            className="flex-1 bg-surface-card border border-surface-border rounded-xl px-4 py-3 font-mono text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
            disabled={loading}
            autoFocus
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-accent text-black text-sm font-bold rounded-xl hover:bg-accent-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 flex items-center gap-2"
          >
            {loading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  msg,
  balances,
  onExecuteAction,
  onExecuteAll,
}: {
  msg: Message;
  balances: Record<string, string>;
  onExecuteAction: (action: EnrichedAction, idx: number) => void;
  onExecuteAll: (actions: EnrichedAction[]) => void;
}) {
  if (msg.role === "system") {
    // System messages are just thin dividers — not shown anymore for tx results
    // (toasts handle those). Only show for genuine system events.
    return null;
  }

  const isUser = msg.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
    >
      {/* AI avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-accent/10  flex items-center justify-center shrink-0 mt-0.5">
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="200" rx="24" fill="#0B0B0B" />

            <path
              d="M50 60H150L50 140H150"
              stroke="#00E5FF"
              stroke-width="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <path
              d="M60 60L140 140M140 60L60 140"
              stroke="#00E5FF"
              stroke-width="6"
              stroke-linecap="round"
            />
          </svg>
        </div>
      )}

      <div
        className={`flex flex-col gap-2 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-zinc-800 border border-zinc-700/80 text-white rounded-br-sm"
              : "bg-surface-card border border-surface-border text-zinc-200 rounded-bl-sm"
          }`}
        >
          {msg.text}
        </div>

        {msg.actions && msg.actions.length > 0 && (
          <div className="w-full space-y-2">
            {msg.actions.map((action, idx) => (
              <ActionCard
                key={idx}
                action={action}
                balances={balances}
                executing={msg.executing ?? false}
                onExecute={() => onExecuteAction(action, idx)}
              />
            ))}
            {msg.actions.filter((a) => a.ready && !a._done).length > 1 &&
              !msg.done && (
                <button
                  onClick={() => onExecuteAll(msg.actions!)}
                  disabled={msg.executing}
                  className="w-full py-2.5 text-xs font-mono text-zinc-500 border border-surface-border rounded-xl hover:border-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-30"
                >
                  {msg.executing
                    ? "executing…"
                    : `confirm all ${msg.actions.filter((a) => a.ready && !a._done).length} actions`}
                </button>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({
  action,
  balances,
  executing,
  onExecute,
}: {
  action: EnrichedAction;
  balances: Record<string, string>;
  executing: boolean;
  onExecute: () => void;
}) {
  // Bridge funds come from the Ethereum wallet, not the Starknet wallet — skip balance check
  const isBridge = action.type === "bridge";
  const available = parseFloat(balances[action.token] ?? "0");
  const amount = parseFloat(action.amount);
  const insufficientFunds = !isBridge && available < amount;
  const canExecute = action.ready && !action._done && !insufficientFunds;

  const ACTION_ICON: Record<string, string> = {
    send: "→",
    swap: "⇄",
    stake: "↑",
    unstake: "↓",
    save: "↑",
    invest: "↑",
    bridge: "⇌",
    dca: "⟳",
    borrow: "↓",
    repay: "↑",
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        action._done
          ? "border-green-500/20 bg-green-500/5"
          : insufficientFunds
            ? "border-red-500/20 bg-red-500/5"
            : !action.ready
              ? "border-zinc-800 bg-surface"
              : "border-surface-border bg-surface-card hover:border-zinc-700"
      }`}
    >
      <div className="px-4 py-3.5 flex items-center gap-4">
        {/* Glyph */}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-base font-mono shrink-0 ${
            action._done
              ? "bg-green-500/10 text-green-400"
              : canExecute
                ? "bg-accent/10 text-accent"
                : "bg-zinc-900 text-zinc-600"
          }`}
        >
          {action._done ? "✓" : (ACTION_ICON[action.type] ?? "·")}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold">
              {action.type}
            </span>
            <span className="text-base font-mono text-white font-semibold">
              {action.amount} {action.token}
            </span>
            {action.toToken && (
              <span className="text-xs font-mono text-zinc-500">
                → {action.toToken}
              </span>
            )}
            {action.recipient && (
              <span className="text-xs font-mono text-zinc-500 truncate max-w-[200px]">
                → {action.recipient}
              </span>
            )}
            {action.frequency && (
              <span className="text-xs font-mono text-zinc-500">
                {action.frequency === "P1D"
                  ? "daily"
                  : action.frequency === "P1M"
                    ? "monthly"
                    : "weekly"}
              </span>
            )}
            {action.collateralToken && (
              <span className="text-xs font-mono text-zinc-500">
                collateral: {action.collateralToken}
              </span>
            )}
            {action.fromChain && (
              <span className="text-xs font-mono text-zinc-500">
                from {action.fromChain}
              </span>
            )}
          </div>

          {action.needsEscrow && !action._done && !insufficientFunds && (
            <p className="text-xs font-mono text-zinc-600 mt-0.5">
              escrowed · recipient gets email claim link
            </p>
          )}
          {action.warning &&
            !insufficientFunds &&
            !action._done &&
            !action.needsEscrow && (
              <p className="text-xs font-mono text-yellow-600 mt-0.5">
                {action.warning}
              </p>
            )}
          {insufficientFunds && !action._done && (
            <p className="text-xs font-mono text-red-500 mt-0.5">
              insufficient — you have {available.toFixed(4)} {action.token}
            </p>
          )}
        </div>

        {/* CTA */}
        {action._done ? (
          <span className="text-xs font-mono text-green-400 shrink-0">
            done
          </span>
        ) : (
          <button
            onClick={onExecute}
            disabled={!canExecute || executing}
            className={`shrink-0 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-colors ${
              canExecute && !executing
                ? "bg-accent text-black hover:bg-accent-dim"
                : "bg-zinc-900 text-zinc-700 border border-zinc-800 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {executing
              ? "…"
              : !action.ready
                ? "invalid"
                : insufficientFunds
                  ? "no funds"
                  : "confirm"}
          </button>
        )}
      </div>
    </div>
  );
}
