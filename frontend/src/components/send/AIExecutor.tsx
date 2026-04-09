/**
 * AIExecutor — the entire product UI.
 * Chat interface that parses natural language, enriches actions via backend,
 * and executes them on-chain through the Starkzap SDK.
 *
 * Transaction results appear as chat messages — not toasts.
 */

import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import type { ParsedAction, TokenSymbol } from "../../types/index.js";
import type { ActivityItem, ChatData } from "../../lib/api.js";

const STARKSCAN = "https://starkscan.co/tx/";

type EnrichedAction = ParsedAction & {
  ready: boolean;
  recipientAddress?: string;
  needsEscrow?: boolean;
  warning?: string;
  _done?: boolean;
};

type MessageRole = "user" | "assistant" | "result-success" | "result-error";

interface Message {
  id: number;
  role: MessageRole;
  text: string;
  actions?: EnrichedAction[];
  executing?: boolean;
  done?: boolean;
  txHash?: string;
  resultLabel?: string;
  data?: ChatData;
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

let _msgId = 0;
function nextId() {
  return ++_msgId;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const KIND_META: Record<
  ActivityItem["kind"],
  { label: string; color: string; bg: string; border: string; glyph: string }
> = {
  send: {
    label: "Sent",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    glyph: "↑",
  },
  receive: {
    label: "Received",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    glyph: "↓",
  },
  swap: {
    label: "Swapped",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    glyph: "⇄",
  },
  dca: {
    label: "DCA",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    glyph: "⟳",
  },
  save: {
    label: "Saved",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    glyph: "↑",
  },
  withdraw: {
    label: "Withdrew",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    glyph: "↓",
  },
  bridge: {
    label: "Bridged",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    glyph: "⇌",
  },
};

// ─── History Widget ────────────────────────────────────────────────────────────

function HistoryWidget({ items }: { items: ActivityItem[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="mt-2 px-4 py-6 rounded-xl border border-surface-border bg-surface-card text-center">
        <p className="text-zinc-600 font-mono text-sm">no activity yet</p>
        <p className="text-zinc-700 text-xs mt-1">
          send some STRK to get started
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-surface-border bg-surface-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-surface-border flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          Activity
        </span>
        <span className="text-[10px] font-mono text-zinc-700">
          {items.length} items
        </span>
      </div>

      {/* Items */}
      <div className="divide-y divide-surface-border">
        {items.map((item, i) => {
          const meta = KIND_META[item.kind] ?? KIND_META.send;
          const isExpanded = expanded === i;
          const shortLabel =
            item.label.length > 22
              ? `${item.label.slice(0, 14)}…${item.label.slice(-6)}`
              : item.label;
          const shortHash = item.tx_hash
            ? `${item.tx_hash.slice(0, 10)}…${item.tx_hash.slice(-6)}`
            : null;

          return (
            <button
              key={i}
              onClick={() => setExpanded(isExpanded ? null : i)}
              className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors group"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center gap-3">
                {/* Glyph badge */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-mono shrink-0 ${meta.bg} ${meta.color} border ${meta.border}`}
                >
                  {meta.glyph}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-xs font-mono font-semibold uppercase tracking-wider ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-sm font-mono text-white font-bold">
                      {parseFloat(item.amount).toFixed(4)}
                    </span>
                    <span className="text-sm font-mono text-accent font-semibold">
                      {item.token}
                    </span>
                    {item.kind === "swap" && (
                      <span className="text-xs font-mono text-zinc-500">
                        → {item.label}
                      </span>
                    )}
                  </div>
                  {item.kind !== "swap" && (
                    <p className="text-xs font-mono text-zinc-600 truncate mt-0.5">
                      {item.kind === "save" || item.kind === "withdraw"
                        ? "Vesu Protocol"
                        : item.kind === "bridge"
                          ? `from ${item.label}`
                          : item.kind === "dca"
                            ? `→ ${item.label}`
                            : shortLabel}
                    </p>
                  )}
                </div>

                {/* Time + chevron */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-mono text-zinc-700">
                    {relativeTime(item.created_at)}
                  </span>
                  <svg
                    className={`w-3 h-3 text-zinc-700 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* Expanded: tx hash */}
              {isExpanded && shortHash && (
                <div className="mt-2.5 ml-11 flex items-center gap-2">
                  <a
                    href={STARKSCAN + item.tx_hash}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-surface-border hover:border-accent/40 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-accent">
                      {shortHash}
                    </span>
                    <svg
                      className="w-2.5 h-2.5 text-accent/60"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}
                  >
                    {item.status}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Help Widget ───────────────────────────────────────────────────────────────

const HELP_COMMANDS = [
  {
    group: "Transfer",
    color: "text-red-400",
    bg: "bg-red-500/8",
    border: "border-red-500/15",
    hoverBorder: "hover:border-red-500/40",
    glyph: "→",
    commands: [
      {
        label: "Send to email",
        example: "send 1 USDC/STRK to friend@gmail.com",
        fill: "Send 1 USDC to ",
      },
      {
        label: "Send to wallet",
        example: "send 5 STRK to 0x04a…",
        fill: "Send 5 STRK to ",
      },
    ],
  },
  {
    group: "Trade",
    color: "text-blue-400",
    bg: "bg-blue-500/8",
    border: "border-blue-500/15",
    hoverBorder: "hover:border-blue-500/40",
    glyph: "⇄",
    commands: [
      {
        label: "Swap tokens",
        example: "swap 1 STRK to USDC",
        fill: "Swap 1 STRK to USDC",
      },
      {
        label: "DCA weekly",
        example: "buy 10 USDC every week",
        fill: "Buy 10 USDC every week",
      },
      {
        label: "DCA daily",
        example: "buy 5 STRK every day",
        fill: "Buy 5 STRK every day",
      },
    ],
  },
  {
    group: "Earn",
    color: "text-cyan-400",
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/15",
    hoverBorder: "hover:border-cyan-500/40",
    glyph: "↑",
    commands: [
      { label: "Save & earn", example: "save 50 USDC", fill: "Save 50 USDC" },
      { label: "Borrow", example: "borrow 50 USDC", fill: "Borrow 50 USDC" },
      { label: "Repay", example: "repay 50 USDC", fill: "Repay 50 USDC" },
    ],
  },
  {
    group: "Bridge",
    color: "text-pink-400",
    bg: "bg-pink-500/8",
    border: "border-pink-500/15",
    hoverBorder: "hover:border-pink-500/40",
    glyph: "⇌",
    commands: [
      {
        label: "Bridge from ETH",
        example: "bridge 10 USDC from Ethereum",
        fill: "Bridge 10 USDC from Ethereum",
      },
    ],
  },
];

function HelpWidget({ onFill }: { onFill: (text: string) => void }) {
  return (
    <div className="mt-2 space-y-3">
      {/* Top note */}
      <div className="flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-surface-border" />
        <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
          tap to try
        </span>
        <div className="h-px flex-1 bg-surface-border" />
      </div>

      {HELP_COMMANDS.map((group) => (
        <div
          key={group.group}
          className="rounded-xl border border-surface-border bg-surface-card overflow-hidden"
        >
          {/* Group header */}
          <div className="px-4 py-2 border-b border-surface-border flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded flex items-center justify-center text-xs font-mono ${group.bg} ${group.color}`}
            >
              {group.glyph}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-semibold">
              {group.group}
            </span>
          </div>

          {/* Commands */}
          <div className="divide-y divide-surface-border">
            {group.commands.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => onFill(cmd.fill)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.025] transition-colors group`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono text-zinc-400 group-hover:text-zinc-200 transition-colors font-semibold">
                    {cmd.label}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-700 group-hover:text-zinc-500 mt-0.5 transition-colors">
                    "{cmd.example}"
                  </p>
                </div>
                <svg
                  className={`w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${group.color}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Gasless note */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <svg
          className="w-3 h-3 text-accent shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span className="text-[10px] font-mono text-zinc-700">
          All Starknet transactions are gasless — AVNU covers fees
        </span>
      </div>
    </div>
  );
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
  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
    : "";

  return (
    <div className="border-b border-surface-border bg-surface-card/50 px-4 sm:px-8 py-5">
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

      <div className="flex items-center justify-center gap-3">
        {walletAddress && (
          <button
            onClick={copyAddress}
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

// ─── Typing Indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start animate-fade-in">
      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
        <svg width="16" height="16" viewBox="0 0 200 200" fill="none">
          <path
            d="M50 60H150L50 140H150"
            stroke="#00E5FF"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M60 60L140 140M140 60L60 140"
            stroke="#00E5FF"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="px-4 py-3.5 rounded-2xl rounded-bl-sm bg-surface-card border border-surface-border flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-zinc-500"
            style={{
              animation: "typing-bounce 1.2s ease-in-out infinite",
              animationDelay: `${i * 180}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Result Bubble ─────────────────────────────────────────────────────────────

function ResultBubble({ msg }: { msg: Message }) {
  const isSuccess = msg.role === "result-success";
  const shortHash = msg.txHash
    ? `${msg.txHash.slice(0, 10)}…${msg.txHash.slice(-6)}`
    : null;

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl rounded-bl-sm border text-sm transition-colors ${
        isSuccess
          ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40"
          : "bg-red-500/5 border-red-500/20"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isSuccess ? "bg-green-500/15" : "bg-red-500/15"}`}
      >
        {isSuccess ? (
          <svg
            className="w-3.5 h-3.5 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-mono text-xs font-semibold ${isSuccess ? "text-green-400" : "text-red-400"}`}
        >
          {isSuccess ? "confirmed" : "failed"}
        </p>
        <p className="text-zinc-300 text-sm leading-snug mt-0.5">{msg.text}</p>
        {shortHash && (
          <p className="font-mono text-[11px] text-accent mt-1.5 flex items-center gap-1">
            {shortHash}
            <svg
              className="w-2.5 h-2.5 opacity-60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 justify-start animate-fade-in">
      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
        <svg width="16" height="16" viewBox="0 0 200 200" fill="none">
          <path
            d="M50 60H150L50 140H150"
            stroke="#00E5FF"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M60 60L140 140M140 60L60 140"
            stroke="#00E5FF"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="max-w-[80%]">
        {msg.txHash ? (
          <a
            href={STARKSCAN + msg.txHash}
            target="_blank"
            rel="noopener noreferrer"
            className="block no-underline"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AIExecutor() {
  const { walletAddress, balances, refreshBalances, profile } = useWallet();
  const queryClient = useQueryClient();
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
        addMessage({
          role: "assistant",
          text: result.message,
          data: result.data,
        });
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
          data: result.data,
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

  // Fill input and focus (for HelpWidget taps)
  const handleFill = (text: string) => {
    setInput(text);
    setTimeout(() => {
      inputRef.current?.focus();
      // Move cursor to end
      const el = inputRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }, 30);
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
            ? `${action.amount} ${action.token} sent — claim link emailed to ${action.recipient}`
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
          const ethWallet = await connectEthereumWallet();
          const bridgeTokens = await getBridgeTokens();
          const bridgeToken = bridgeTokens.find(
            (t) => t.symbol.toUpperCase() === action.token.toUpperCase(),
          );
          if (!bridgeToken)
            throw new Error(
              `${action.token} not available for bridging. Supported: ${bridgeTokens.map((t) => t.symbol).join(", ")}`,
            );
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
          resultText = `${action.amount} ${action.token} bridge initiated — funds arrive in ~10 min`;
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
          resultText = `DCA active — selling ${action.amount} ${action.token} → ${action.toToken} ${freqLabel}`;
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

      refreshBalances();

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

      addMessage({ role: "result-success", text: resultText, txHash });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["claim-links"] });
    } catch (err: any) {
      updateMessage(msgId, { executing: false });

      let errMsg = err.message ?? "Unknown error";
      if (
        errMsg.includes("paymaster") ||
        errMsg.includes("gas") ||
        errMsg.includes("fee")
      ) {
        const isLending = ["unstake", "save", "invest", "stake"].includes(
          action.type,
        );
        errMsg = isLending
          ? "Vesu lending on Mainnet may not support this token, or the paymaster couldn't cover gas. Try with STRK."
          : "Make sure you have STRK for gas, or the paymaster may not support this token pair on Mainnet.";
      } else if (
        errMsg.includes("insufficient") ||
        errMsg.includes("balance")
      ) {
        errMsg = `Insufficient balance for this transaction.`;
      }

      addMessage({ role: "result-error", text: errMsg });
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
    <>
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease both; }
      `}</style>

      <div className="h-full flex flex-col overflow-hidden">
        <PortfolioBar />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 space-y-5 max-w-3xl mx-auto w-full">
          {messages.map((msg) =>
            msg.role === "result-success" || msg.role === "result-error" ? (
              <ResultBubble key={msg.id} msg={msg} />
            ) : (
              <ChatBubble
                key={msg.id}
                msg={msg}
                balances={balances}
                onFill={handleFill}
                onExecuteAction={(action, idx) =>
                  handleExecuteAction(msg.id, action, idx)
                }
                onExecuteAll={(actions) => handleExecuteAll(msg.id, actions)}
              />
            ),
          )}

          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Quick commands + input */}
        <div className="border-t border-surface-border bg-surface">
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
    </>
  );
}

// ─── Chat Bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  msg,
  balances,
  onFill,
  onExecuteAction,
  onExecuteAll,
}: {
  msg: Message;
  balances: Record<string, string>;
  onFill: (text: string) => void;
  onExecuteAction: (action: EnrichedAction, idx: number) => void;
  onExecuteAll: (actions: EnrichedAction[]) => void;
}) {
  const isUser = msg.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
    >
      {/* AI avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 200 200" fill="none">
            <path
              d="M50 60H150L50 140H150"
              stroke="#00E5FF"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M60 60L140 140M140 60L60 140"
              stroke="#00E5FF"
              strokeWidth="6"
              strokeLinecap="round"
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

        {/* Rich data widgets */}
        {msg.data?.type === "history" && (
          <div className="w-full animate-slide-up">
            <HistoryWidget items={msg.data.items} />
          </div>
        )}
        {msg.data?.type === "help" && (
          <div className="w-full animate-slide-up">
            <HelpWidget onFill={onFill} />
          </div>
        )}

        {/* Action cards */}
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
      className={`rounded-xl border overflow-hidden transition-all duration-300 ${
        action._done
          ? "border-green-500/20 bg-green-500/5"
          : insufficientFunds
            ? "border-red-500/20 bg-red-500/5"
            : !action.ready
              ? "border-zinc-800 bg-surface"
              : executing && !action._done
                ? "border-accent/30 bg-accent/5 animate-pulse"
                : "border-surface-border bg-surface-card hover:border-zinc-700"
      }`}
    >
      <div className="px-4 py-3.5 flex items-center gap-4">
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
              recipient gets email claim link, check spam folder.
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
