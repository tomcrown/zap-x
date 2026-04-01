import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { claimApi } from '../../lib/api.js';
import { useWallet } from '../../contexts/WalletContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { ClaimLink } from '../../types/index.js';
import { Button } from '../common/Button.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';

export function ClaimPageContent() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, walletAddress, login } = useWallet();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ClaimLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    claimApi.get(token)
      .then(setClaim)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleClaim = async () => {
    if (!token || !walletAddress) return;
    setClaiming(true);
    try {
      const result = await claimApi.redeem(token, walletAddress);
      setTxHash(result.txHash);
      setClaimed(true);
      toast({ type: 'success', title: 'Funds claimed!', txHash: result.txHash });
    } catch (err: any) {
      toast({ type: 'error', title: 'Claim failed', message: err.message });
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-white mb-2">Link Not Found</h1>
          <p className="text-slate-400 mb-6">{error || 'This claim link does not exist or has already been used.'}</p>
          <Button variant="secondary" onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  const isExpired = new Date(claim.expiresAt) < new Date();

  if (claimed) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Claimed!</h1>
          <p className="text-slate-400 mb-2">
            {claim.amount} {claim.tokenType} has been sent to your wallet.
          </p>
          {txHash && (
            <a
              href={`https://starkscan.co/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:underline text-sm font-mono block mb-6"
            >
              View transaction →
            </a>
          )}
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-2xl font-black">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            Zap<span className="text-gradient">-X</span>
          </div>
        </div>

        <div className="card">
          <h1 className="text-2xl font-black text-white text-center mb-2">
            You have funds waiting! 🎉
          </h1>

          {/* Amount highlight */}
          <div className="my-6 p-6 rounded-2xl bg-gradient-to-br from-brand-900/50 to-brand-950/50 border border-brand-500/30 text-center">
            <p className="text-5xl font-black text-white mb-1">{claim.amount}</p>
            <p className="text-xl font-bold text-brand-400">{claim.tokenType}</p>
            <p className="text-xs text-slate-500 mt-2">
              on Starknet
            </p>
          </div>

          {/* Status */}
          {claim.status !== 'pending' && (
            <div className={`p-3 rounded-xl text-center text-sm font-semibold mb-4 ${
              claim.status === 'claimed'
                ? 'bg-green-500/10 text-green-400'
                : 'bg-slate-500/10 text-slate-400'
            }`}>
              This claim has been {claim.status}.
            </div>
          )}

          {isExpired && claim.status === 'pending' && (
            <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-sm text-center mb-4">
              This claim link has expired.
            </div>
          )}

          {/* Expiry */}
          {claim.status === 'pending' && !isExpired && (
            <p className="text-xs text-slate-500 text-center mb-6">
              ⏳ Expires{' '}
              {new Date(claim.expiresAt).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </p>
          )}

          {/* Actions */}
          {claim.status === 'pending' && !isExpired && (
            isAuthenticated ? (
              <div className="space-y-3">
                <div className="p-3 bg-surface rounded-xl border border-surface-border flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow" />
                  <span className="font-mono text-xs text-slate-300">
                    {walletAddress?.slice(0, 12)}…{walletAddress?.slice(-8)}
                  </span>
                </div>
                <Button
                  onClick={handleClaim}
                  loading={claiming}
                  className="w-full"
                  size="lg"
                >
                  Claim {claim.amount} {claim.tokenType}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-400 text-center">
                  Connect your wallet to claim these funds. Don't have one? We'll create one for you — no seed phrases required.
                </p>
                <Button onClick={login} className="w-full" size="lg">
                  Connect / Create Wallet
                </Button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
