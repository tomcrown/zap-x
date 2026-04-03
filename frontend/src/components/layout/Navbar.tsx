import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext.js';

export function Navbar() {
  const { isAuthenticated, walletAddress, profile, login, logout, isWalletConnecting } = useWallet();
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const short = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : '';

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-surface/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xl font-black tracking-tight">
            Zap<span className="text-gradient">-X</span>
          </span>
        </Link>

        {/* Nav links */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/send">Send</NavLink>
            <NavLink to="/lend">Lend</NavLink>
            <NavLink to="/swap">Swap</NavLink>
          </nav>
        )}

        {/* Auth */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {walletAddress ? (
                <button
                  onClick={copyAddress}
                  title={copied ? 'Copied!' : 'Click to copy address'}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-brand-500 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow" />
                  <span className="font-mono text-xs text-slate-300">{copied ? 'Copied!' : short}</span>
                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              ) : (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-xs text-slate-400">
                    {isWalletConnecting ? 'Creating wallet…' : 'No wallet'}
                  </span>
                </div>
              )}
              {profile?.username && (
                <span className="hidden sm:block text-sm text-slate-400">@{profile.username}</span>
              )}
              <button onClick={logout} className="btn-ghost text-sm">
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={login} className="btn-primary">
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-surface-hover transition-all duration-150"
    >
      {children}
    </Link>
  );
}
