import React from 'react';
import { BalanceCard } from '../components/dashboard/BalanceCard.js';
import { TransactionList } from '../components/dashboard/TransactionList.js';
import { StakingPanel } from '../components/dashboard/StakingPanel.js';
import { ClaimLinksPanel } from '../components/dashboard/ClaimLinksPanel.js';
import { useWallet } from '../contexts/WalletContext.js';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { profile, walletAddress } = useWallet();

  const greeting = profile?.username ? `@${profile.username}` : 'there';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">
            Welcome back, {greeting} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Here's a snapshot of your Zap-X portfolio
          </p>
        </div>
        <Link to="/send" className="btn-primary shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          Send Funds
        </Link>
      </div>

      {/* Quick stats row */}
      <QuickStats walletAddress={walletAddress} />

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BalanceCard />
        <StakingPanel />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TransactionList />
        <ClaimLinksPanel />
      </div>
    </div>
  );
}

function QuickStats({ walletAddress }: { walletAddress: string | null }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[
        { label: 'Network',   value: 'Starknet',  sub: 'Sepolia Testnet', color: 'text-blue-400' },
        { label: 'Gas Mode',  value: 'Gasless',   sub: 'AVNU Paymaster',  color: 'text-green-400' },
        { label: 'Wallet',    value: 'Active',    sub: 'Privy Embedded',  color: 'text-purple-400' },
        { label: 'Protocol',  value: 'Starkzap',  sub: 'v2 SDK',          color: 'text-brand-400' },
      ].map(({ label, value, sub, color }) => (
        <div key={label} className="card py-4 text-center">
          <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
          <p className={`text-lg font-bold ${color}`}>{value}</p>
          <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  );
}
