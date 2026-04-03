import React from 'react';
import { useToast, Toast as ToastType } from '../../contexts/ToastContext.js';

const TYPE_CONFIG: Record<ToastType['type'], { dot: string; border: string }> = {
  success: { dot: 'bg-green-400', border: 'border-green-500/20' },
  error:   { dot: 'bg-red-400',   border: 'border-red-500/20'   },
  info:    { dot: 'bg-accent',    border: 'border-accent/20'    },
  warning: { dot: 'bg-yellow-400',border: 'border-yellow-500/20'},
};

function ToastItem({ toast }: { toast: ToastType }) {
  const { dismiss } = useToast();
  const cfg = TYPE_CONFIG[toast.type];
  const isClickable = !!toast.txHash;

  const content = (
    <div className={`
      flex items-start gap-3 px-4 py-3.5 rounded-xl border bg-surface-card shadow-2xl
      animate-slide-up transition-all duration-150
      ${cfg.border}
      ${isClickable ? 'cursor-pointer hover:border-zinc-600 group' : ''}
    `}>
      {/* Status dot */}
      <div className="flex items-center shrink-0 mt-1">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-zinc-500 font-mono mt-0.5 leading-snug">{toast.message}</p>
        )}
        {toast.txHash && (
          <p className="text-xs font-mono text-accent mt-1 group-hover:underline">
            {toast.txHash.slice(0, 14)}…{toast.txHash.slice(-6)} ↗
          </p>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(toast.id); }}
        className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors mt-0.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  if (isClickable) {
    return (
      <a
        href={`https://starkscan.co/tx/${toast.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block no-underline"
      >
        {content}
      </a>
    );
  }

  return content;
}

export function ToastContainer() {
  const { toasts } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
