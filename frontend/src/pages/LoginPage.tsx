import React from 'react';
import { Navigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext.js';

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useWallet();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface flex items-center justify-center p-4">
      {/* Glow background */}
      <div className="absolute inset-0 bg-gradient-glow pointer-events-none opacity-50" />

      <div className="relative w-full max-w-lg animate-slide-up">
        {/* Hero section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 text-sm font-semibold mb-6">
            ⚡ Powered by Starknet + Privy + AVNU
          </div>
          <h1 className="text-5xl font-black text-white mb-4">
            Send <span className="text-gradient">STRK & Bitcoin</span><br />
            to anyone, instantly
          </h1>
          <p className="text-lg text-slate-400 max-w-md mx-auto">
            Gasless transfers. AI-powered commands. Claim links for new users. Stake for yield — all in one place.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {[
            '⚡ Gasless via AVNU',
            '🔗 Claim links',
            '🤖 AI commands',
            '📈 Staking yields',
            '🔐 Privy wallets',
            '₿ Bitcoin support',
          ].map((feat) => (
            <span
              key={feat}
              className="px-3 py-1.5 rounded-full bg-surface-card border border-surface-border text-sm text-slate-300"
            >
              {feat}
            </span>
          ))}
        </div>

        {/* CTA card */}
        <div className="card glow-card text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-brand flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Get started in seconds</h2>
          <p className="text-slate-400 text-sm mb-6">
            No seed phrases. No downloads. Just your email or Google account.
          </p>
          <button
            onClick={login}
            disabled={isLoading}
            className="btn-primary w-full text-base py-3.5"
          >
            {isLoading ? 'Loading…' : 'Connect Wallet'}
          </button>
          <p className="text-xs text-slate-600 mt-4">
            Wallet created automatically via Privy · Starknet Sepolia
          </p>
        </div>
      </div>
    </div>
  );
}
