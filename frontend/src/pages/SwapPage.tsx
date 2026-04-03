import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { swapApi } from '../lib/api.js';
import { getSwapQuote, executeSwap } from '../lib/starkzap.js';
import { useWallet } from '../contexts/WalletContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { Button } from '../components/common/Button.js';
import { Select } from '../components/common/Input.js';
import type { TokenSymbol } from '../types/index.js';

const SWAP_TOKENS: { value: TokenSymbol; label: string }[] = [
  { value: 'STRK', label: 'STRK' },
  { value: 'ETH',  label: 'ETH'  },
  { value: 'USDC', label: 'USDC' },
  { value: 'USDT', label: 'USDT' },
];

export function SwapPage() {
  const { walletAddress, balances, refreshBalances } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tokenIn, setTokenIn]   = useState<TokenSymbol>('STRK');
  const [tokenOut, setTokenOut] = useState<TokenSymbol>('USDC');
  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote]       = useState<{ amountOut: string; priceImpact: string; provider: string } | null>(null);
  const [quoting, setQuoting]   = useState(false);
  const [swapping, setSwapping] = useState(false);

  const { data: history } = useQuery({
    queryKey: ['swap-history'],
    queryFn: swapApi.history,
    enabled: !!walletAddress,
  });

  const availableIn = parseFloat(balances[tokenIn] ?? '0');

  const handleFlip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
    setQuote(null);
  };

  const handleGetQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || tokenIn === tokenOut) return;
    setQuoting(true);
    setQuote(null);
    try {
      const q = await getSwapQuote(tokenIn, tokenOut, amountIn);
      setQuote(q);
    } catch (err: any) {
      toast({ type: 'error', title: 'Quote failed', message: err.message });
    } finally {
      setQuoting(false);
    }
  }, [amountIn, tokenIn, tokenOut, toast]);

  const handleSwap = async () => {
    if (!walletAddress || !amountIn || !quote) return;
    setSwapping(true);
    try {
      const txHash = await executeSwap(tokenIn, tokenOut, amountIn, 100n, true);
      await swapApi.record({
        tokenIn, tokenOut, amountIn,
        amountOut: quote.amountOut,
        txHash,
        provider: quote.provider,
      });
      toast({ type: 'success', title: 'Swap submitted!', txHash });
      setAmountIn('');
      setQuote(null);
      queryClient.invalidateQueries({ queryKey: ['swap-history'] });
      refreshBalances();
    } catch (err: any) {
      toast({ type: 'error', title: 'Swap failed', message: err.message });
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white">Swap</h1>
        <p className="text-slate-500 text-sm mt-1">
          Swap tokens instantly via AVNU &amp; Ekubo
        </p>
      </div>

      {/* Swap card */}
      <div className="card space-y-3">
        {/* Token In */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">You pay</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={amountIn}
                onChange={(e) => { setAmountIn(e.target.value); setQuote(null); }}
                placeholder="0.00"
                className="input font-mono pr-16"
              />
              <button
                onClick={() => { setAmountIn(availableIn.toFixed(6)); setQuote(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 font-semibold"
              >
                MAX
              </button>
            </div>
            <div className="w-32">
              <Select
                value={tokenIn}
                onChange={(e) => { setTokenIn(e.target.value as TokenSymbol); setQuote(null); }}
                options={SWAP_TOKENS.filter((t) => t.value !== tokenOut)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Balance: <span className="font-mono">{availableIn.toFixed(4)} {tokenIn}</span>
          </p>
        </div>

        {/* Flip button */}
        <div className="flex justify-center">
          <button
            onClick={handleFlip}
            className="w-9 h-9 rounded-xl bg-surface border border-surface-border flex items-center justify-center hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* Token Out */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">You receive</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                readOnly
                value={quote ? parseFloat(quote.amountOut).toFixed(6) : ''}
                placeholder="0.00"
                className="input font-mono bg-surface-card cursor-default"
              />
            </div>
            <div className="w-32">
              <Select
                value={tokenOut}
                onChange={(e) => { setTokenOut(e.target.value as TokenSymbol); setQuote(null); }}
                options={SWAP_TOKENS.filter((t) => t.value !== tokenIn)}
              />
            </div>
          </div>
        </div>

        {/* Quote details */}
        {quote && (
          <div className="p-3 rounded-xl bg-surface border border-surface-border text-sm space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Rate</span>
              <span className="font-mono text-white">
                1 {tokenIn} ≈ {(parseFloat(quote.amountOut) / parseFloat(amountIn)).toFixed(4)} {tokenOut}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Price impact</span>
              <span className={parseFloat(quote.priceImpact) > 1 ? 'text-red-400' : 'text-green-400'}>
                {quote.priceImpact}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Route</span>
              <span className="capitalize">{quote.provider}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Slippage</span>
              <span>1%</span>
            </div>
          </div>
        )}

        {/* Actions */}
        {!quote ? (
          <Button
            onClick={handleGetQuote}
            loading={quoting}
            disabled={!amountIn || parseFloat(amountIn) <= 0 || tokenIn === tokenOut}
            className="w-full"
            size="lg"
          >
            Get Quote
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setQuote(null)} className="flex-1">
              Reset
            </Button>
            <Button
              onClick={handleSwap}
              loading={swapping}
              className="flex-1"
              size="lg"
            >
              Swap {amountIn} {tokenIn} → {tokenOut}
            </Button>
          </div>
        )}
      </div>

      {/* History */}
      {history && history.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-white mb-4">Recent Swaps</h2>
          <div className="space-y-2">
            {history.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-surface-border">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-white">
                    {parseFloat(s.amount_in).toFixed(4)} {s.token_in}
                  </span>
                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span className="font-mono text-sm text-brand-400">
                    {parseFloat(s.amount_out).toFixed(4)} {s.token_out}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 capitalize">{s.provider}</span>
                  <a
                    href={`https://starkscan.co/tx/${s.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:underline"
                  >
                    ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
