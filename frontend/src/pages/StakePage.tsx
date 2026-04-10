import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stakingApi } from "../lib/api.js";
import {
  executeStake,
  executeExitIntent,
  executeExit,
  getPoolPosition,
} from "../lib/starkzap.js";
import { useWallet } from "../contexts/WalletContext.js";
import { useToast } from "../contexts/ToastContext.js";
import { Button } from "../components/common/Button.js";
import { LoadingSpinner } from "../components/common/LoadingSpinner.js";
import { Modal } from "../components/common/Modal.js";
import { config } from "../config.js";
import type { StakingPosition } from "../types/index.js";

export function StakePage() {
  const { walletAddress, balances } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [stakeModal, setStakeModal] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [staking, setStaking] = useState(false);

  const { data: pools } = useQuery({
    queryKey: ["pools"],
    queryFn: stakingApi.pools,
  });
  const { data: stats, isLoading } = useQuery({
    queryKey: ["staking-stats"],
    queryFn: stakingApi.stats,
    enabled: !!walletAddress,
    refetchInterval: 60_000,
  });

  const selectedPool = config.strkStakingPool;
  const availableStrk = parseFloat(balances["STRK"] ?? "0");

  const handleStake = async () => {
    if (!walletAddress || !stakeAmount || parseFloat(stakeAmount) <= 0) return;
    setStaking(true);
    try {
      const txHash = await executeStake(
        selectedPool,
        stakeAmount,
        "STRK",
        true,
      );

      await stakingApi.record({
        userWallet: walletAddress,
        poolAddress: selectedPool,
        amount: stakeAmount,
        token: "STRK",
        txHash,
      });

      toast({ type: "success", title: "Staked successfully!", txHash });
      setStakeModal(false);
      setStakeAmount("");
      queryClient.invalidateQueries({ queryKey: ["staking-stats"] });
    } catch (err: any) {
      toast({ type: "error", title: "Staking failed", message: err.message });
    } finally {
      setStaking(false);
    }
  };

  const handleExitIntent = async (position: StakingPosition) => {
    if (!walletAddress) return;
    try {
      const txHash = await executeExitIntent(
        position.pool_address,
        position.staked_amount,
        "STRK",
      );
      await stakingApi.recordExitIntent(position.id, txHash);
      toast({
        type: "info",
        title: "Exit intent submitted",
        message: "Cooldown period started.",
        txHash,
      });
      queryClient.invalidateQueries({ queryKey: ["staking-stats"] });
    } catch (err: any) {
      toast({
        type: "error",
        title: "Exit intent failed",
        message: err.message,
      });
    }
  };

  const handleExit = async (position: StakingPosition) => {
    if (!walletAddress) return;
    try {
      const txHash = await executeExit(position.pool_address);
      await stakingApi.recordExit(position.id, txHash);
      toast({
        type: "success",
        title: "Unstaked!",
        message: "Funds returned to your wallet.",
        txHash,
      });
      queryClient.invalidateQueries({ queryKey: ["staking-stats"] });
    } catch (err: any) {
      toast({ type: "error", title: "Exit failed", message: err.message });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Testnet notice */}
      {config.starknetNetwork === "sepolia" && (
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>
            <strong>Testnet mode:</strong> Staking is simulated on Sepolia — no
            real funds are staked. Delegation pools are only active on mainnet.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Stake & Earn</h1>
          <p className="text-slate-500 text-sm mt-1">
            Earn ~8.5% APY on your idle STRK — powered by Starknet staking
            protocol
          </p>
        </div>
        <Button onClick={() => setStakeModal(true)} size="md">
          + Stake STRK
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">Total Staked</p>
            <p className="text-2xl font-black text-white font-mono">
              {parseFloat(stats.totalStaked).toFixed(4)}
            </p>
            <p className="text-xs text-slate-500">STRK</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">
              Projected Annual Yield
            </p>
            <p className="text-2xl font-black text-green-400 font-mono">
              {parseFloat(stats.projectedAnnualYield).toFixed(4)}
            </p>
            <p className="text-xs text-slate-500">STRK / year</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">Protocol APY</p>
            <p className="text-2xl font-black text-brand-400">~8.5%</p>
            <p className="text-xs text-slate-500">Live on-chain rate</p>
          </div>
        </div>
      )}

      {/* Available Pools */}
      {pools && pools.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-white mb-4">Available Pools</h2>
          <div className="space-y-3">
            {pools.map((pool) => (
              <div
                key={pool.address}
                className="flex items-center justify-between p-4 rounded-xl bg-surface border border-surface-border"
              >
                <div>
                  <p className="font-semibold text-white">{pool.name}</p>
                  <p className="font-mono text-xs text-slate-500 mt-0.5">
                    {pool.address.slice(0, 14)}…
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400">{pool.apy}</p>
                  <p className="text-xs text-slate-500">APY in {pool.token}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Positions */}
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
                      <p className="font-semibold text-white">
                        {pos.pool_name}
                      </p>
                      <span
                        className={`badge ${pos.status === "active" ? "badge-active" : pos.status === "exiting" ? "badge-pending" : "badge-expired"}`}
                      >
                        {pos.status}
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-purple-400">
                      {parseFloat(pos.staked_amount).toFixed(4)}
                      <span className="text-sm text-purple-600 ml-1">
                        {pos.token}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Staked {new Date(pos.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {pos.status === "active" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleExitIntent(pos)}
                      >
                        Start Unstake
                      </Button>
                    )}
                    {pos.status === "exiting" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleExit(pos)}
                      >
                        Complete Exit
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
            <div className="text-5xl mb-3">📈</div>
            <p className="text-slate-500">No active positions</p>
            <p className="text-xs text-slate-600 mt-1">
              Start staking to earn passive yield
            </p>
          </div>
        )}
      </div>

      {/* Stake Modal */}
      <Modal
        open={stakeModal}
        onClose={() => setStakeModal(false)}
        title="Stake STRK"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-surface border border-surface-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Available</span>
              <span className="font-mono font-bold text-white">
                {availableStrk.toFixed(4)} STRK
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Amount to Stake
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.00"
                className="input font-mono pr-20"
              />
              <button
                onClick={() => setStakeAmount(availableStrk.toFixed(6))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 font-semibold"
              >
                MAX
              </button>
            </div>
          </div>

          {stakeAmount && (
            <div className="p-3 rounded-xl bg-surface border border-surface-border text-sm space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Estimated annual yield</span>
                <span className="text-green-400 font-mono">
                  ~{(parseFloat(stakeAmount || "0") * 0.085).toFixed(4)} STRK
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Pool APY</span>
                <span>~8.5%</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleStake}
            loading={staking}
            disabled={!stakeAmount || parseFloat(stakeAmount) <= 0}
            className="w-full"
            size="lg"
          >
            Stake {stakeAmount || "0"} STRK
          </Button>
          <p className="text-xs text-slate-500 text-center">
            Unstaking requires a cooldown period as per Starknet protocol
          </p>
        </div>
      </Modal>
    </div>
  );
}
