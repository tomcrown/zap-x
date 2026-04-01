import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { claimApi } from '../../lib/api.js';
import { ClaimLink } from '../../types/index.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../common/Button.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';

function ClaimRow({ claim, onCancel }: { claim: ClaimLink; onCancel: (token: string) => void }) {
  const isExpired = new Date(claim.expiresAt) < new Date();
  const statusDisplay = isExpired && claim.status === 'pending' ? 'expired' : claim.status;

  const statusClass: Record<string, string> = {
    pending:   'badge-pending',
    claimed:   'badge-claimed',
    expired:   'badge-expired',
    cancelled: 'badge-expired',
  };

  const recipient = claim.recipientEmail ?? claim.recipientUsername ?? 'Unknown';
  const expiryLabel = new Date(claim.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center justify-between py-3 border-b border-surface-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-brand-600/20 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">
            To: <span className="text-slate-400">{recipient}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Expires {expiryLabel}</p>
        </div>
      </div>

      <div className="text-right shrink-0 ml-4 space-y-1">
        <p className="text-sm font-bold font-mono text-yellow-400">
          {claim.amount} {claim.tokenType}
        </p>
        <span className={`badge ${statusClass[statusDisplay] ?? 'badge-expired'}`}>
          {statusDisplay}
        </span>
        {claim.status === 'pending' && !isExpired && (
          <div className="flex gap-2 justify-end mt-1">
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/claim/${claim.token}`)}
              className="text-xs text-brand-400 hover:underline"
            >
              Copy link
            </button>
            <span className="text-slate-600">·</span>
            <button
              onClick={() => onCancel(claim.token)}
              className="text-xs text-red-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClaimLinksPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['claim-links'],
    queryFn: claimApi.list,
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (token: string) => claimApi.cancel(token),
    onSuccess: (result) => {
      toast({ type: 'success', title: 'Claim cancelled', message: 'Funds refunded to your wallet.', txHash: result.txHash });
      queryClient.invalidateQueries({ queryKey: ['claim-links'] });
    },
    onError: (err: Error) => {
      toast({ type: 'error', title: 'Cancel failed', message: err.message });
    },
  });

  if (isLoading) return <div className="card flex justify-center py-8"><LoadingSpinner /></div>;

  const claims = data ?? [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Claim Links</h2>
        <span className="text-xs text-slate-500">
          {claims.filter((c) => c.status === 'pending').length} pending
        </span>
      </div>

      {claims.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-slate-500 text-sm">No claim links yet</p>
          <p className="text-slate-600 text-xs mt-1">Send to an email to generate a claim link</p>
        </div>
      ) : (
        <div className="divide-y divide-transparent">
          {claims.map((c) => (
            <ClaimRow
              key={c.token}
              claim={c}
              onCancel={(token) => cancelMutation.mutate(token)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
