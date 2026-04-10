import React, { useState } from "react";
import { SendForm } from "../components/send/SendForm.js";
import { AICommandInput } from "../components/send/AICommandInput.js";
import { AIExecutor } from "../components/send/AIExecutor.js";
import { ParsedAction } from "../types/index.js";

export function SendPage() {
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");
  const [prefill, setPrefill] = useState<Partial<ParsedAction> | undefined>();

  const handleAIActions = (actions: ParsedAction[]) => {
    const sendAction = actions.find((a) => a.type === "send");
    if (sendAction) {
      setPrefill(sendAction);
      setActiveTab("manual");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Send Funds</h1>
        <p className="text-slate-500 text-sm mt-1">
          Transfer STRK or Bitcoin to any user, email, or wallet address —
          gasless
        </p>
      </div>

      {/* AI Command Bar */}
      <AICommandInput onActions={handleAIActions} />

      {/* Tab switcher */}
      <div className="flex rounded-xl bg-surface-card border border-surface-border p-1 gap-1">
        {(["manual", "ai"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
              activeTab === tab
                ? "bg-brand-600/30 text-brand-400 border border-brand-500/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "manual" ? "✏️ Manual Form" : "🤖 AI Actions Queue"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card">
        {activeTab === "manual" ? (
          <SendForm
            key={JSON.stringify(prefill)}
            prefill={prefill}
            onSuccess={() => setPrefill(undefined)}
          />
        ) : (
          <AIExecutor />
        )}
      </div>
    </div>
  );
}
