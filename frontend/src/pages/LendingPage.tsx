import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lendingApi } from "../lib/api.js";
import {
  executeLendingDeposit,
  executeLendingWithdraw,
} from "../lib/starkzap.js";
import { useWallet } from "../contexts/WalletContext.js";
import { useToast } from "../contexts/ToastContext.js";
import { Button } from "../components/common/Button.js";
import { LoadingSpinner } from "../components/common/LoadingSpinner.js";
import { Modal } from "../components/common/Modal.js";
import { Select } from "../components/common/Input.js";
import type { LendingPosition, TokenSymbol } from "../types/index.js";

const SUPPORTED_TOKENS: { value: TokenSymbol; label: string; apy: string }[] = [
  { value: "STRK", label: "STRK — Starknet Token", apy: "~6%" },
  { value: "ETH", label: "ETH — Ethereum", apy: "~4%" },
  { value: "USDC", label: "USDC — USD Coin", apy: "~8%" },
];

export function LendingPage() {
  const { walletAddress, balances } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [depositModal, setDepositModal] = useState(false);
  const [depositToken, setDepositToken] = useState<TokenSymbol>("STRK");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState<number | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["lending-stats"],
    queryFn: lendingApi.stats,
    enabled: !!walletAddress,
    refetchInterval: 60_000,
  });

  const available = parseFloat(balances[depositToken] ?? "0");
  const selectedTokenInfo = SUPPORTED_TOKENS.find(
    (t) => t.value === depositToken,
  )!;

  const handleDeposit = async () => {
    if (!walletAddress || !depositAmount || parseFloat(depositAmount) <= 0)
      return;
    setDepositing(true);
    try {
      const txHash = await executeLendingDeposit(
        depositToken,
        depositAmount,
        true,
      );
      await lendingApi.deposit({
        token: depositToken,
        amount: depositAmount,
        txHash,
      });
      toast({ type: "success", title: "Deposit successful!", txHash });
      setDepositModal(false);
      setDepositAmount("");
      queryClient.invalidateQueries({ queryKey: ["lending-stats"] });
    } catch (err: any) {
      toast({ type: "error", title: "Deposit failed", message: err.message });
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async (position: LendingPosition) => {
    if (!walletAddress) return;
    setWithdrawing(position.id);
    try {
      const txHash = await executeLendingWithdraw(
        position.token as TokenSymbol,
        position.supplied_amount,
      );
      await lendingApi.withdraw(position.id, txHash);
      toast({
        type: "success",
        title: "Withdrawn!",
        message: "Funds returned to your wallet.",
        txHash,
      });
      queryClient.invalidateQueries({ queryKey: ["lending-stats"] });
    } catch (err: any) {
      toast({ type: "error", title: "Withdraw failed", message: err.message });
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Save & Earn</h1>
          <p className="text-slate-500 text-sm mt-1">
            Supply tokens to Vesu and earn yield — powered by Starknet DeFi
          </p>
        </div>
        <Button onClick={() => setDepositModal(true)} size="md">
          + Supply Tokens
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">Total Supplied</p>
            <p className="text-2xl font-black text-white font-mono">
              {parseFloat(stats.totalSupplied).toFixed(4)}
            </p>
            <p className="text-xs text-slate-500">across positions</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">
              Projected Annual Yield
            </p>
            <p className="text-2xl font-black text-green-400 font-mono">
              {parseFloat(stats.projectedAnnualYield).toFixed(4)}
            </p>
            <p className="text-xs text-slate-500">tokens / year</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">Protocol</p>
            <p className="text-2xl font-black text-brand-400">Vesu</p>
            <p className="text-xs text-slate-500">Non-custodial lending</p>
          </div>
        </div>
      )}

      {/* Markets */}
      <div className="card">
        <h2 className="font-bold text-white mb-4">Available Markets</h2>
        <div className="space-y-3">
          {SUPPORTED_TOKENS.map((t) => (
            <div
              key={t.value}
              className="flex items-center justify-between p-4 rounded-xl bg-surface border border-surface-border"
            >
              <div>
                <p className="font-semibold text-white">{t.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.label.split("—")[1]?.trim()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-400">{t.apy}</p>
                <p className="text-xs text-slate-500">Supply APY</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* My Positions */}
      <div className="card">
        <h2 className="font-bold text-white mb-4">My Positions</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : stats?.positions && stats.positions.length > 0 ? (
          <div className="space-y-3">
            {stats.positions.map((pos) => (
              <div
                key={pos.id}
                className="p-4 rounded-xl bg-surface border border-surface-border"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-white">{pos.token}</p>
                      <span
                        className={`badge ${pos.status === "active" ? "badge-active" : "badge-expired"}`}
                      >
                        {pos.status}
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-purple-400">
                      {parseFloat(pos.supplied_amount).toFixed(4)}
                      <span className="text-sm text-purple-600 ml-1">
                        {pos.token}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supplied {new Date(pos.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {pos.status === "active" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={withdrawing === pos.id}
                        onClick={() => handleWithdraw(pos)}
                      >
                        Withdraw
                      </Button>
                    )}
                    {pos.entry_tx_hash && (
                      <a
                        href={`https://starkscan.co/tx/${pos.entry_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost text-xs"
                      >
                        View Tx
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">🏦</div>
            <p className="text-slate-500">No active positions</p>
            <p className="text-xs text-slate-600 mt-1">
              Supply tokens to start earning yield
            </p>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      <Modal
        open={depositModal}
        onClose={() => setDepositModal(false)}
        title="Supply Tokens"
      >
        <div className="space-y-4">
          <Select
            label="Token"
            value={depositToken}
            onChange={(e) => setDepositToken(e.target.value as TokenSymbol)}
            options={SUPPORTED_TOKENS.map((t) => ({
              value: t.value,
              label: t.label,
            }))}
          />

          <div className="p-4 rounded-xl bg-surface border border-surface-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Available</span>
              <span className="font-mono font-bold text-white">
                {available.toFixed(4)} {depositToken}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Amount to Supply
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="input font-mono pr-20"
              />
              <button
                onClick={() => setDepositAmount(available.toFixed(6))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 font-semibold"
              >
                MAX
              </button>
            </div>
          </div>

          {depositAmount && parseFloat(depositAmount) > 0 && (
            <div className="p-3 rounded-xl bg-surface border border-surface-border text-sm space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Estimated annual yield</span>
                <span className="text-green-400 font-mono">
                  ~{(parseFloat(depositAmount) * 0.06).toFixed(4)}{" "}
                  {depositToken}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Supply APY</span>
                <span>{selectedTokenInfo.apy}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Protocol</span>
                <span>Vesu Finance</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleDeposit}
            loading={depositing}
            disabled={!depositAmount || parseFloat(depositAmount) <= 0}
            className="w-full"
            size="lg"
          >
            Supply {depositAmount || "0"} {depositToken}
          </Button>
          <p className="text-xs text-slate-500 text-center">
            Withdraw anytime — no lockup period
          </p>
        </div>
      </Modal>
    </div>
  );
}
