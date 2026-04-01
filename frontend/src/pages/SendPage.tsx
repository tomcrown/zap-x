import React, { useState } from 'react';
import { SendForm } from '../components/send/SendForm.js';
import { AICommandInput } from '../components/send/AICommandInput.js';
import { ParsedAction, TokenSymbol } from '../types/index.js';

export function SendPage() {
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
  const [prefill, setPrefill] = useState<Partial<ParsedAction> | undefined>();

  // When AI parses actions, pre-fill the manual form with the first send action
  const handleAIActions = (actions: ParsedAction[]) => {
    const sendAction = actions.find((a) => a.type === 'send');
    if (sendAction) {
      setPrefill(sendAction);
      setActiveTab('manual');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Send Funds</h1>
        <p className="text-slate-500 text-sm mt-1">
          Transfer STRK or Bitcoin to any user, email, or wallet address — gasless
        </p>
      </div>

      {/* AI Command Bar */}
      <AICommandInput onActions={handleAIActions} />

      {/* Tab switcher */}
      <div className="flex rounded-xl bg-surface-card border border-surface-border p-1 gap-1">
        {(['manual', 'ai'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
              activeTab === tab
                ? 'bg-brand-600/30 text-brand-400 border border-brand-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'manual' ? '✏️ Manual Form' : '🤖 AI Actions Queue'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card">
        {activeTab === 'manual' ? (
          <SendForm
            key={JSON.stringify(prefill)}
            prefill={prefill}
            onSuccess={() => setPrefill(undefined)}
          />
        ) : (
          <AIActionsQueue />
        )}
      </div>
    </div>
  );
}

function AIActionsQueue() {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🤖</div>
      <h3 className="text-lg font-bold text-white mb-2">AI Actions Queue</h3>
      <p className="text-slate-400 text-sm max-w-sm mx-auto">
        Use the AI Command Bar above to parse natural language commands. Parsed actions will appear here for review before execution.
      </p>
      <p className="text-xs text-slate-500 mt-3">
        Try: "Send 5 STRK to @alice and stake 10 STRK"
      </p>
    </div>
  );
}
