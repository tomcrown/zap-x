import React, { useState } from "react";
import { aiApi } from "../../lib/api.js";
import { AIParseResult, ParsedAction } from "../../types/index.js";
import { Button } from "../common/Button.js";

interface Props {
  onActions: (actions: ParsedAction[]) => void;
}

export function AICommandInput({ onActions }: Props) {
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<AIParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const examples = [
    "Send 5 STRK to @tony",
    "Send 10 STRK to chris@example.com and stake 2 STRK",
    "Stake 50 STRK",
    "Send 0.001 wBTC to 0x04a…",
  ];

  const handleParse = async () => {
    if (!command.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const parsed = await aiApi.parse(command);
      setResult(parsed);
    } catch (err: any) {
      setError(err.message ?? "Failed to parse command");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  };

  const handleExecuteAll = () => {
    if (result?.actions.length) {
      onActions(result.actions);
      setResult(null);
      setCommand("");
    }
  };

  return (
    <div className="card border-brand-500/30 bg-gradient-to-br from-surface-card to-brand-950/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-white text-sm">AI Command Bar</h3>
        </div>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "Send 5 STRK to @tolu and stake 2 STRK"'
          className="input flex-1 text-sm"
        />
        <Button
          onClick={handleParse}
          loading={loading}
          disabled={!command.trim()}
          size="md"
          icon={
            <svg
              className="w-4 h-4"
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
          }
        >
          Parse
        </Button>
      </div>

      {/* Examples */}
      {!result && !loading && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setCommand(ex)}
              className="text-xs px-2.5 py-1 rounded-lg bg-surface border border-surface-border text-slate-400 hover:text-brand-400 hover:border-brand-500/50 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Parsed actions */}
      {result && result.actions.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400 font-medium">
              Parsed {result.actions.length} action
              {result.actions.length !== 1 ? "s" : ""}
              <span className="ml-2 text-green-400">
                {Math.round(result.confidence * 100)}% confident
              </span>
            </p>
          </div>

          <div className="space-y-2 mb-3">
            {result.actions.map((action, i) => (
              <ActionPreview key={i} action={action} index={i + 1} />
            ))}
          </div>

          {result.clarification && (
            <p className="text-xs text-yellow-400 mb-3">
              ⚠ {result.clarification}
            </p>
          )}

          <Button onClick={handleExecuteAll} className="w-full">
            Execute {result.actions.length} Action
            {result.actions.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {result && result.actions.length === 0 && (
        <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
          {result.clarification ??
            "Could not extract any actions from that command. Try rephrasing."}
        </div>
      )}
    </div>
  );
}

function ActionPreview({
  action,
  index,
}: {
  action: ParsedAction;
  index: number;
}) {
  const icons: Record<string, string> = {
    send: "📤",
    stake: "📈",
    unstake: "📉",
    swap: "🔄",
    save: "💰",
    invest: "💎",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-surface-border">
      <span className="text-lg">{icons[action.type] ?? "⚡"}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-slate-500 uppercase font-semibold">
          Action {index}
        </span>
        <p className="text-sm text-white font-medium">
          <span className="capitalize text-brand-400">{action.type}</span>{" "}
          <span className="font-mono">
            {action.amount} {action.token}
          </span>
          {action.recipient && (
            <>
              {" "}
              to <span className="text-slate-300">{action.recipient}</span>
            </>
          )}
          {action.toToken && (
            <>
              {" "}
              → <span className="text-slate-300">{action.toToken}</span>
            </>
          )}
        </p>
        {action.note && (
          <p className="text-xs text-slate-500 mt-0.5 italic">
            "{action.note}"
          </p>
        )}
      </div>
    </div>
  );
}
