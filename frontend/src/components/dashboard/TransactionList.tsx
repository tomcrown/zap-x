import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { transferApi } from '../../lib/api.js';
import { Transaction } from '../../types/index.js';
import { useWallet } from '../../contexts/WalletContext.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';

function StatusBadge({ status }: { status: Transaction['status'] }) {
  const classes = {
    pending:   'badge-pending',
    confirmed: 'badge-success',
    failed:    'badge-failed',
  };
  return <span className={`badge ${classes[status]}`}>{status}</span>;
}

function TxRow({ tx, myAddress }: { tx: Transaction; myAddress: string }) {
  const isSent = tx.sender_wallet === myAddress;
  const sign = isSent ? '-' : '+';
  const color = isSent ? 'text-red-400' : 'text-green-400';
  const label = isSent ? 'To' : 'From';
  const identifier = isSent ? tx.recipient_identifier : tx.sender_wallet;
  const shortId = identifier.length > 20
    ? `${identifier.slice(0, 8)}…${identifier.slice(-6)}`
    : identifier;
  const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center justify-between py-3 border-b border-surface-border last:border-0 hover:bg-surface-hover/30 px-2 rounded-lg transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isSent ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
          <svg className={`w-4 h-4 ${isSent ? 'text-red-400' : 'text-green-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isSent
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            }
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">
            {label}: <span className="font-mono text-slate-400">{shortId}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{date}</p>
        </div>
      </div>

      <div className="text-right shrink-0 ml-4">
        <p className={`text-sm font-bold font-mono ${color}`}>
          {sign}{tx.amount} {tx.token}
        </p>
        <div className="mt-0.5 flex justify-end">
          <StatusBadge status={tx.status} />
        </div>
        {tx.tx_hash && (
          <a
            href={`https://starkscan.co/tx/${tx.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-400 hover:underline font-mono"
          >
            {tx.tx_hash.slice(0, 10)}…
          </a>
        )}
      </div>
    </div>
  );
}

export function TransactionList() {
  const { walletAddress, profile } = useWallet();
  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', walletAddress],
    queryFn: transferApi.history,
    enabled: !!walletAddress && !!profile,
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="card flex justify-center py-10">
      <LoadingSpinner />
    </div>
  );

  if (error) return (
    <div className="card text-center py-8 text-red-400 text-sm">
      Failed to load transactions. <button className="underline" onClick={() => window.location.reload()}>Retry</button>
    </div>
  );

  const transactions = data ?? [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Transactions</h2>
        <span className="text-xs text-slate-500">{transactions.length} records</span>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-surface flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-slate-500 text-sm">No transactions yet</p>
          <p className="text-slate-600 text-xs mt-1">Send your first STRK or Bitcoin transfer</p>
        </div>
      ) : (
        <div className="divide-y divide-transparent">
          {transactions.map((tx) => (
            <TxRow key={tx.id} tx={tx} myAddress={walletAddress!} />
          ))}
        </div>
      )}
    </div>
  );
}
