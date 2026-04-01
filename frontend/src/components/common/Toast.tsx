import React from 'react';
import { useToast, Toast as ToastType } from '../../contexts/ToastContext.js';

const icons: Record<ToastType['type'], string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
};

const colors: Record<ToastType['type'], string> = {
  success: 'border-green-500/40 bg-green-500/10 text-green-400',
  error:   'border-red-500/40   bg-red-500/10   text-red-400',
  info:    'border-blue-500/40  bg-blue-500/10  text-blue-400',
  warning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
};

const iconColors: Record<ToastType['type'], string> = {
  success: 'bg-green-500/20  text-green-400',
  error:   'bg-red-500/20    text-red-400',
  info:    'bg-blue-500/20   text-blue-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
};

function ToastItem({ toast }: { toast: ToastType }) {
  const { dismiss } = useToast();

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl animate-slide-up ${colors[toast.type]}`}
    >
      <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${iconColors[toast.type]}`}>
        {icons[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white">{toast.title}</p>
        {toast.message && <p className="text-xs text-slate-400 mt-0.5">{toast.message}</p>}
        {toast.txHash && (
          <a
            href={`https://starkscan.co/tx/${toast.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-400 hover:underline mt-0.5 block font-mono"
          >
            {toast.txHash.slice(0, 20)}…
          </a>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="shrink-0 text-slate-500 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-[360px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
