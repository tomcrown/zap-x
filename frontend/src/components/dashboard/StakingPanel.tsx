import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { stakingApi } from '../../lib/api.js';
import { Link } from 'react-router-dom';
import { LoadingSpinner } from '../common/LoadingSpinner.js';

export function StakingPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['staking-stats'],
    queryFn: stakingApi.stats,
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="card flex justify-center py-8"><LoadingSpinner /></div>;

  const stats = data;
  const hasPositions = stats && stats.positions.length > 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Staking & Yield</h2>
        <Link to="/stake" className="text-sm text-brand-400 hover:text-brand-300 font-medium">
          Manage →
        </Link>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-4 rounded-xl bg-surface border border-surface-border">
            <p className="text-xs text-slate-500 mb-1">Total Staked</p>
            <p className="text-xl font-bold text-white font-mono">
              {parseFloat(stats.totalStaked).toFixed(4)}
              <span className="text-sm text-slate-400 ml-1">STRK</span>
            </p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-surface-border">
            <p className="text-xs text-slate-500 mb-1">Projected Annual Yield</p>
            <p className="text-xl font-bold text-green-400 font-mono">
              {parseFloat(stats.projectedAnnualYield).toFixed(4)}
              <span className="text-sm text-green-600 ml-1">STRK</span>
            </p>
          </div>
        </div>
      )}

      {/* Positions list */}
      {hasPositions ? (
        <div className="space-y-2">
          {stats!.positions.slice(0, 3).map((pos) => (
            <div key={pos.id} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-surface-border">
              <div>
                <p className="text-sm font-semibold text-slate-200">{pos.pool_name}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {pos.pool_address.slice(0, 10)}…
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold font-mono text-purple-400">
                  {parseFloat(pos.staked_amount).toFixed(4)} {pos.token}
                </p>
                <span className={`badge ${pos.status === 'active' ? 'badge-active' : 'badge-pending'}`}>
                  {pos.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📈</div>
          <p className="text-slate-500 text-sm">No staking positions</p>
          <p className="text-slate-600 text-xs mt-1">Earn ~8.5% APY on your STRK</p>
          <Link to="/stake" className="inline-block mt-3 btn-secondary text-sm">
            Start Staking
          </Link>
        </div>
      )}
    </div>
  );
}
