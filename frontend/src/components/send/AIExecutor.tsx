/**
 * AIExecutor
 *
 * Full chat-driven command interface. Users type natural language commands,
 * the backend parses + enriches them, and this component executes each
 * action on-chain via the Starkzap SDK.
 *
 * Supported actions: send, swap, save/stake, unstake, lend/invest
 */

import React, { useState, useRef, useEffect } from 'react';
import { chatApi, transferApi, swapApi, lendingApi } from '../../lib/api.js';
import {
  executeTransfer,
  executeSwap,
  executeLendingDeposit,
  executeLendingWithdraw,
} from '../../lib/starkzap.js';
import { useWallet } from '../../contexts/WalletContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../common/Button.js';
import type { ParsedAction, TokenSymbol } from '../../types/index.js';

type EnrichedAction = ParsedAction & {
  ready: boolean;
  recipientAddress?: string;
  needsEscrow?: boolean;
  warning?: string;
};

type MessageRole = 'user' | 'assistant' | 'system';

interface Message {
  id: number;
  role: MessageRole;
  text: string;
  actions?: EnrichedAction[];
  executing?: boolean;
  done?: boolean;
}

const EXAMPLES = [
  'Send 2 STRK to tomcrown317@gmail.com',
  'Swap 1 STRK to USDC',
  'Save 3 STRK',
  'Check my balance',
];

let _msgId = 0;
function nextId() { return ++_msgId; }

export function AIExecutor() {
  const { walletAddress, balances, refreshBalances } = useWallet();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([{
    id: nextId(),
    role: 'system',
    text: 'Hi! I\'m your Zap-X AI assistant. Tell me what you\'d like to do — send, swap, save, or lend tokens.',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  };

  const updateMessage = (id: number, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    addMessage({ role: 'user', text });

    try {
      const result = await chatApi.send(text);

      if (!result.success || result.actions.length === 0) {
        addMessage({
          role: 'assistant',
          text: result.message,
        });
        return;
      }

      const msgId = nextId();
      setMessages((prev) => [...prev, {
        id: msgId,
        role: 'assistant',
        text: result.message,
        actions: result.actions as EnrichedAction[],
      }]);
    } catch (err: any) {
      addMessage({ role: 'assistant', text: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (msgId: number, action: EnrichedAction, actionIndex: number) => {
    if (!walletAddress) return;

    updateMessage(msgId, { executing: true });

    try {
      let txHash: string | undefined;
      let resultText = '';

      switch (action.type) {

        case 'send': {
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
            ? `Escrowed ${action.amount} ${action.token} — claim link sent to ${action.recipient}`
            : `Sent ${action.amount} ${action.token} to ${action.recipient}`;
          break;
        }

        case 'swap': {
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
            amountOut: '0', // actual out unknown without pre-quote
            txHash,
            provider: 'avnu',
          });
          resultText = `Swapped ${action.amount} ${action.token} → ${action.toToken}`;
          break;
        }

        case 'save':
        case 'invest':
        case 'stake': {
          txHash = await executeLendingDeposit(action.token, action.amount, true);
          await lendingApi.deposit({ token: action.token, amount: action.amount, txHash });
          resultText = `Supplied ${action.amount} ${action.token} to Vesu lending`;
          break;
        }

        case 'unstake': {
          // Find active lending position for this token
          const positions = await lendingApi.positions();
          const pos = positions.find(
            (p) => p.token === action.token && p.status === 'active'
          );
          if (!pos) throw new Error(`No active ${action.token} position to withdraw.`);
          txHash = await executeLendingWithdraw(action.token, action.amount);
          await lendingApi.withdraw(pos.id, txHash);
          resultText = `Withdrew ${action.amount} ${action.token} from Vesu`;
          break;
        }

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      toast({ type: 'success', title: resultText, txHash });
      refreshBalances();

      // Update that specific action as done
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId || !m.actions) return m;
        const newActions = m.actions.map((a, i) =>
          i === actionIndex ? { ...a, _done: true } : a
        );
        const allDone = newActions.every((a: any) => a._done);
        return { ...m, actions: newActions, executing: false, done: allDone };
      }));

      addMessage({ role: 'system', text: `✅ ${resultText}${txHash ? ` · [View on Starkscan](https://starkscan.co/tx/${txHash})` : ''}` });

    } catch (err: any) {
      updateMessage(msgId, { executing: false });
      toast({ type: 'error', title: 'Action failed', message: err.message });
      addMessage({ role: 'system', text: `❌ Failed: ${err.message}` });
    }
  };

  const handleExecuteAll = async (msgId: number, actions: EnrichedAction[]) => {
    const readyActions = actions.filter((a) => a.ready);
    for (let i = 0; i < readyActions.length; i++) {
      await handleExecuteAction(msgId, readyActions[i], actions.indexOf(readyActions[i]));
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[700px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            balances={balances}
            onExecuteAction={(action, idx) => handleExecuteAction(msg.id, action, idx)}
            onExecuteAll={(actions) => handleExecuteAll(msg.id, actions)}
          />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Examples */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setInput(ex)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-surface border border-surface-border text-slate-400 hover:text-brand-400 hover:border-brand-500/50 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-surface-border">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder='e.g. "Send 5 STRK to @alice" or "Swap 1 ETH to USDC"'
          className="input flex-1 text-sm"
          disabled={loading}
        />
        <Button onClick={handleSend} loading={loading} disabled={!input.trim()} size="md">
          Send
        </Button>
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
  if (msg.role === 'system') {
    return (
      <div className="text-xs text-slate-500 text-center py-1">
        {msg.text}
      </div>
    );
  }

  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm ${
          isUser
            ? 'bg-brand-600/30 border border-brand-500/30 text-white rounded-br-sm'
            : 'bg-surface-card border border-surface-border text-slate-200 rounded-bl-sm'
        }`}>
          {msg.text}
        </div>

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
            {msg.actions.filter((a) => a.ready).length > 1 && !msg.done && (
              <Button
                onClick={() => onExecuteAll(msg.actions!)}
                loading={msg.executing}
                className="w-full"
                size="sm"
              >
                Execute All {msg.actions.filter((a) => a.ready).length} Actions
              </Button>
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
  action: EnrichedAction & { _done?: boolean };
  balances: Record<string, string>;
  executing: boolean;
  onExecute: () => void;
}) {
  const icons: Record<string, string> = {
    send: '📤', swap: '🔄', stake: '📈', unstake: '📉', save: '💰', invest: '💎',
  };

  const available = parseFloat(balances[action.token] ?? '0');
  const amount = parseFloat(action.amount);
  const insufficientFunds = available < amount;

  const canExecute = action.ready && !action._done && !insufficientFunds;

  return (
    <div className={`p-3 rounded-xl border text-sm ${
      action._done
        ? 'bg-green-500/10 border-green-500/30'
        : action.ready
        ? 'bg-surface border-surface-border'
        : 'bg-red-500/10 border-red-500/20'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span>{icons[action.type] ?? '⚡'}</span>
          <div className="min-w-0">
            <p className="text-white font-medium">
              <span className="capitalize text-brand-400">{action.type}</span>{' '}
              <span className="font-mono">{action.amount} {action.token}</span>
              {action.recipient && <> → <span className="text-slate-300 truncate">{action.recipient}</span></>}
              {action.toToken && <> → <span className="text-slate-300">{action.toToken}</span></>}
            </p>
            {action.warning && (
              <p className="text-xs text-yellow-400 mt-0.5">⚠ {action.warning}</p>
            )}
            {insufficientFunds && !action._done && (
              <p className="text-xs text-red-400 mt-0.5">
                Insufficient balance ({available.toFixed(4)} {action.token} available)
              </p>
            )}
          </div>
        </div>

        {action._done ? (
          <span className="text-green-400 text-xs font-semibold shrink-0">Done ✓</span>
        ) : (
          <Button
            size="sm"
            variant={canExecute ? 'primary' : 'secondary'}
            onClick={onExecute}
            loading={executing}
            disabled={!canExecute}
          >
            {!action.ready ? 'Invalid' : insufficientFunds ? 'Low funds' : 'Execute'}
          </Button>
        )}
      </div>
    </div>
  );
}
