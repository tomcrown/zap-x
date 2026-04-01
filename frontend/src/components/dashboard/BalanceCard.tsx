import React from 'react';
import { useWallet } from '../../contexts/WalletContext.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { TokenSymbol } from '../../types/index.js';

const TOKEN_ICONS: Record<TokenSymbol, string> = {
  STRK:  '⚡',
  ETH:   'Ξ',
  USDC:  '$',
  USDT:  '₮',
  wBTC:  '₿',
  lBTC:  '₿',
  tBTC:  '₿',
};

const TOKEN_COLORS: Record<TokenSymbol, string> = {
  STRK:  'text-purple-400 bg-purple-500/20',
  ETH:   'text-blue-400   bg-blue-500/20',
  USDC:  'text-green-400  bg-green-500/20',
  USDT:  'text-teal-400   bg-teal-500/20',
  wBTC:  'text-orange-400 bg-orange-500/20',
  lBTC:  'text-orange-400 bg-orange-500/20',
  tBTC:  'text-orange-400 bg-orange-500/20',
};

export function BalanceCard() {
  const { balances, balancesLoading, refreshBalances, walletAddress } = useWallet();

  const displayTokens: TokenSymbol[] = ['STRK', 'ETH', 'USDC', 'wBTC'];

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
    : '';

  return (
    <div className="card glow-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Your Wallet</h2>
          <p className="font-mono text-xs text-slate-500 mt-0.5">{shortAddr}</p>
        </div>
        <button
          onClick={refreshBalances}
          disabled={balancesLoading}
          className="btn-ghost text-xs"
          title="Refresh balances"
        >
          <svg className={`w-4 h-4 ${balancesLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Token grid */}
      {balancesLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayTokens.map((token) => {
            const amount = balances[token] ?? '0';
            const hasBalance = parseFloat(amount) > 0;
            return (
              <div
                key={token}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-surface-border hover:border-surface-hover transition-colors"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${TOKEN_COLORS[token]}`}>
                  {TOKEN_ICONS[token]}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium">{token}</p>
                  <p className={`text-sm font-bold font-mono truncate ${hasBalance ? 'text-white' : 'text-slate-600'}`}>
                    {parseFloat(amount).toFixed(4)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
