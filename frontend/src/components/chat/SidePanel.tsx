import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  transferApi,
  lendingApi,
  swapApi,
  claimApi,
  dcaApi,
} from "../../lib/api.js";
import { useWallet } from "../../contexts/WalletContext.js";
import { TokenSymbol, ClaimLink } from "../../types/index.js";
import { executeDcaCancel, getDcaOrders } from "../../lib/starkzap.js";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "../../contexts/ToastContext.js";

const STARKSCAN = "https://starkscan.co/tx/";

const TOKEN_LABEL: Record<string, string> = {
  STRK: "STRK",
  ETH: "ETH",
  USDC: "USDC",
  USDT: "USDT",
  wBTC: "BTC",
};

const CAPABILITIES = [
  { cmd: "Send", ex: "send 5 STRK to tony@gmail.com" },
  { cmd: "Swap", ex: "swap 1 ETH to USDC" },
  { cmd: "Save", ex: "save 50 USDC" },
  { cmd: "Withdraw", ex: "withdraw my USDC position" },
  { cmd: "Bridge", ex: "bridge 10 USDC from Ethereum" },
  { cmd: "DCA", ex: "buy 10 USDC every week" },
  { cmd: "Borrow", ex: "borrow 50 USDC" },
  { cmd: "History", ex: "recent transactions" },
];

type ActivityKind = "send" | "receive" | "swap" | "lend" | "withdraw";

interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  label: string;
  amount: string;
  token: string;
  txHash: string | null;
  date: string;
}

function buildActivity(
  walletAddress: string,
  txs: any[],
  swps: any[],
  positions: any[],
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const tx of txs as any[]) {
    const isSent = tx.sender_wallet === walletAddress;
    entries.push({
      id: `tx-${tx.id}`,
      kind: isSent ? "send" : "receive",
      label: isSent ? tx.recipient_identifier : tx.sender_wallet,
      amount: tx.amount,
      token: tx.token,
      txHash: tx.tx_hash,
      date: tx.created_at,
    });
  }

  for (const sw of swps as any[]) {
    entries.push({
      id: `sw-${sw.id}`,
      kind: "swap",
      label: `${sw.token_in} → ${sw.token_out}`,
      amount: sw.amount_in,
      token: sw.token_in,
      txHash: sw.tx_hash,
      date: sw.created_at,
    });
  }

  for (const pos of positions as any[]) {
    entries.push({
      id: `lend-${pos.id}`,
      kind: pos.status === "withdrawn" ? "withdraw" : "lend",
      label: "Vesu",
      amount: pos.supplied_amount,
      token: pos.token,
      txHash: pos.entry_tx_hash,
      date: pos.created_at,
    });
  }

  return entries
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);
}

const KIND_COLOR: Record<ActivityKind, string> = {
  send: "text-red-400",
  receive: "text-green-400",
  swap: "text-accent",
  lend: "text-yellow-400",
  withdraw: "text-zinc-400",
};
const KIND_SIGN: Record<ActivityKind, string> = {
  send: "−",
  receive: "+",
  swap: "⇄",
  lend: "↑",
  withdraw: "↓",
};

function ClaimRow({ claim }: { claim: ClaimLink }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => claimApi.cancel(claim.token),
    onSuccess: (result: any) => {
      setCancelled(true);
      toast({
        type: "success",
        title: "Claim cancelled",
        message: "Funds refunded to your wallet.",
        txHash: result?.txHash,
      });
      queryClient.invalidateQueries({ queryKey: ["claim-links"] });
    },
    onError: (e: Error) => {
      toast({ type: "error", title: "Cancel failed", message: e.message });
    },
    onSettled: () => setConfirming(false),
  });

  const isPending = claim.status === "pending" && !cancelled;

  const recipient = claim.recipientEmail ?? claim.recipientUsername ?? "—";
  const shortRecipient =
    recipient.length > 18 ? `${recipient.slice(0, 14)}…` : recipient;

  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-mono uppercase tracking-wider ${
              isPending
                ? "text-yellow-500"
                : claim.status === "claimed"
                  ? "text-green-500"
                  : "text-zinc-600"
            }`}
          >
            {claim.status}
          </span>
          <span className="text-xs font-mono text-white">
            {claim.amount} {claim.tokenType}
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-600 block truncate">
          → {shortRecipient}
        </span>
      </div>
      {isPending && (
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {confirming ? (
            <>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
              >
                {cancelMutation.isPending ? "…" : "confirm"}
              </button>
              <span className="text-zinc-700 text-[10px]">·</span>
              <button
                onClick={() => setConfirming(false)}
                disabled={cancelMutation.isPending}
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
              >
                keep
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-[10px] font-mono text-zinc-700 hover:text-red-400 transition-colors"
            >
              cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const FREQ_LABEL: Record<string, string> = {
  P1D: "daily",
  P7D: "weekly",
  P1M: "monthly",
};

function DcaRow({ order }: { order: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!order.order_address) {
        throw new Error(
          "Order address not available — this order was created before on-chain cancellation was supported. Contact support to cancel.",
        );
      }
      await executeDcaCancel(order.order_address);
      await dcaApi.cancel(order.order_address, order.tx_hash);
    },
    onSuccess: () => {
      toast({
        type: "success",
        title: "DCA cancelled",
        message: `${order.amount_per_cycle} ${order.sell_token} → ${order.buy_token}`,
      });
      queryClient.invalidateQueries({ queryKey: ["dca-orders"] });
    },
    onError: (e: Error) => {
      toast({ type: "error", title: "Cancel failed", message: e.message });
    },
    onSettled: () => setConfirming(false),
  });

  const freqLabel = FREQ_LABEL[order.frequency] ?? order.frequency;

  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-accent">
            {freqLabel}
          </span>
          <span className="text-xs font-mono text-white">
            {order.amount_per_cycle} {order.sell_token}
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-600 block">
          → {order.buy_token}
        </span>
      </div>
      {order.status === "active" && (
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {confirming ? (
            <>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
              >
                {cancelMutation.isPending ? "…" : "confirm"}
              </button>
              <span className="text-zinc-700 text-[10px]">·</span>
              <button
                onClick={() => setConfirming(false)}
                disabled={cancelMutation.isPending}
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
              >
                keep
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-[10px] font-mono text-zinc-700 hover:text-red-400 transition-colors"
            >
              cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SidePanel({ isOpen, onClose }: Props) {
  const { walletAddress, balances, balancesLoading, refreshBalances } =
    useWallet();

  const { data: transactions } = useQuery({
    queryKey: ["transactions", walletAddress],
    queryFn: transferApi.history,
    enabled: !!walletAddress,
    refetchInterval: 30_000,
  });

  const { data: swaps } = useQuery({
    queryKey: ["swaps", walletAddress],
    queryFn: swapApi.history,
    enabled: !!walletAddress,
    refetchInterval: 30_000,
  });

  const { data: positions } = useQuery({
    queryKey: ["lending-positions", walletAddress],
    queryFn: lendingApi.positions,
    enabled: !!walletAddress,
    refetchInterval: 60_000,
  });

  const { data: claims } = useQuery({
    queryKey: ["claim-links"],
    queryFn: claimApi.list,
    enabled: !!walletAddress,
    refetchInterval: 30_000,
  });

  const { data: dcaOrders } = useQuery({
    queryKey: ["dca-orders"],
    queryFn: dcaApi.orders,
    enabled: !!walletAddress,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const missing = (dcaOrders ?? []).filter(
      (o: any) => !o.order_address && o.status === "active",
    );
    if (!missing.length) return;
    getDcaOrders()
      .then((onChainOrders) => {
        missing.forEach((dbOrder: any) => {
          const match = onChainOrders.find(
            (o: any) =>
              String(o.creationTransactionHash).toLowerCase() ===
              dbOrder.tx_hash.toLowerCase(),
          );
          if (match?.orderAddress) {
            dcaApi
              .patchAddress(dbOrder.tx_hash, String(match.orderAddress))
              .catch(() => {});
          }
        });
      })
      .catch(() => {});
  }, [dcaOrders]);

  const displayTokens: TokenSymbol[] = ["STRK", "ETH", "USDC", "wBTC"];
  const activePositions = (positions ?? [])
    .filter((p) => p.status === "active")
    .slice(0, 3);

  const activity = buildActivity(
    walletAddress ?? "",
    transactions ?? [],
    swaps ?? [],
    positions ?? [],
  );

  const pendingClaims = (claims ?? []).filter((c) => c.status === "pending");
  const nonPendingClaims = (claims ?? [])
    .filter((c) => c.status !== "pending")
    .slice(0, 5);
  const displayClaims = [...pendingClaims, ...nonPendingClaims];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={`
          fixed lg:relative z-30 lg:z-auto
          top-14 lg:top-auto bottom-0 left-0
          flex flex-col
          bg-surface-card border-r border-surface-border
          transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? "w-72 lg:w-64" : "w-0"}
        `}
      >
        <div className="flex flex-col h-full min-w-[16rem] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
            <span className="text-xs font-mono text-zinc-600 uppercase tracking-widest">
              Portfolio
            </span>
            <button
              onClick={onClose}
              className="text-zinc-700 hover:text-zinc-400 transition-colors lg:hidden"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Balances */}
          <div className="px-4 py-4 border-b border-surface-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-600 font-mono">Balances</span>
              <button
                onClick={refreshBalances}
                disabled={balancesLoading}
                className="text-zinc-700 hover:text-zinc-400 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 ${balancesLoading ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {displayTokens.map((token) => {
                const amount = parseFloat(balances[token] ?? "0");
                const hasBalance = amount > 0;
                return (
                  <div
                    key={token}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs font-mono text-zinc-500">
                      {TOKEN_LABEL[token]}
                    </span>
                    <span
                      className={`text-xs font-mono ${hasBalance ? "text-white" : "text-zinc-800"}`}
                    >
                      {amount.toFixed(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active lending positions */}
          {activePositions.length > 0 && (
            <div className="px-4 py-4 border-b border-surface-border">
              <span className="text-xs text-zinc-600 font-mono block mb-3">
                Lending
              </span>
              <div className="space-y-2">
                {activePositions.map((pos) => (
                  <div
                    key={pos.id}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs font-mono text-zinc-500">
                      {pos.token}
                    </span>
                    <span className="text-xs font-mono text-accent">
                      {parseFloat(pos.supplied_amount).toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email transfers (claims) */}
          {displayClaims.length > 0 && (
            <div className="px-4 py-4 border-b border-surface-border">
              <span className="text-xs text-zinc-600 font-mono block mb-2">
                Email transfers
              </span>
              <div className="divide-y divide-surface-border">
                {displayClaims.map((c) => (
                  <ClaimRow key={c.token} claim={c} />
                ))}
              </div>
            </div>
          )}

          {/* DCA orders */}
          {(dcaOrders ?? []).filter((o) => o.status === "active").length >
            0 && (
            <div className="px-4 py-4 border-b border-surface-border">
              <span className="text-xs text-zinc-600 font-mono block mb-2">
                DCA orders
              </span>
              <div className="divide-y divide-surface-border">
                {(dcaOrders ?? [])
                  .filter((o) => o.status === "active")
                  .slice(0, 3)
                  .map((o) => (
                    <DcaRow key={o.id} order={o} />
                  ))}
              </div>
            </div>
          )}

          {/* Activity feed */}
          <div className="px-4 py-4 border-b border-surface-border">
            <span className="text-xs text-zinc-600 font-mono block mb-3">
              Activity
            </span>
            {activity.length === 0 ? (
              <p className="text-xs text-zinc-800 font-mono">no activity yet</p>
            ) : (
              <div className="space-y-2">
                {activity.map((entry) => {
                  const shortLabel =
                    entry.label.length > 16
                      ? `${entry.label.slice(0, 10)}…${entry.label.slice(-4)}`
                      : entry.label;
                  const row = (
                    <div className="flex items-center justify-between gap-2 group">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-xs font-mono shrink-0 ${KIND_COLOR[entry.kind]}`}
                        >
                          {KIND_SIGN[entry.kind]}
                        </span>
                        <span className="text-xs font-mono text-zinc-600 truncate">
                          {entry.kind === "swap" ? entry.label : shortLabel}
                        </span>
                        {entry.txHash && (
                          <svg
                            className="w-2.5 h-2.5 text-zinc-800 group-hover:text-accent shrink-0 transition-colors"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        )}
                      </div>
                      <span
                        className={`text-xs font-mono shrink-0 ${KIND_COLOR[entry.kind]}`}
                      >
                        {entry.amount} {entry.token}
                      </span>
                    </div>
                  );

                  return entry.txHash ? (
                    <a
                      key={entry.id}
                      href={STARKSCAN + entry.txHash}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={entry.id}>{row}</div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Capabilities */}
          <div className="px-4 py-4 flex-1">
            <span className="text-xs text-white-600 font-mono block mb-3">
              What I can do
            </span>
            <div className="space-y-1.5">
              {CAPABILITIES.map((c) => (
                <div key={c.cmd} className="group">
                  <span className="text-xs font-mono text-zinc-700 group-hover:text-zinc-400 transition-colors">
                    {c.ex}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-surface-border shrink-0">
            <p className="text-xs font-mono text-zinc-800 text-center">
              Starknet · Mainnet
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
