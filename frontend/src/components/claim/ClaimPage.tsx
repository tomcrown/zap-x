import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { claimApi } from "../../lib/api.js";
import { useWallet } from "../../contexts/WalletContext.js";
import { useToast } from "../../contexts/ToastContext.js";
import { ClaimLink } from "../../types/index.js";

export function ClaimPageContent() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, walletAddress, isWalletConnecting, login } =
    useWallet();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ClaimLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    claimApi
      .get(token)
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
      toast({
        type: "success",
        title: "Funds claimed!",
        txHash: result.txHash,
      });
    } catch (err: any) {
      toast({ type: "error", title: "Claim failed", message: err.message });
    } finally {
      setClaiming(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-accent animate-blink"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !claim) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <p className="font-mono text-xs text-zinc-600 mb-4">404</p>
          <h1 className="text-xl font-semibold text-white mb-2">
            Link not found
          </h1>
          <p className="text-zinc-500 text-sm mb-8">
            {error ||
              "This claim link does not exist or has already been used."}
          </p>
          <button
            onClick={() => navigate("/")}
            className="text-sm text-accent font-mono hover:underline"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  const isExpired = new Date(claim.expiresAt) < new Date();

  // ── Claimed ──────────────────────────────────────────────────────────────────
  if (claimed) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in text-center">
          <div className="w-12 h-12 mx-auto mb-6 rounded-full border border-green-500/30 bg-green-500/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Claimed</h1>
          <p className="text-zinc-400 text-sm mb-6">
            {claim.amount} {claim.tokenType} has been sent to your wallet.
          </p>
          {txHash && (
            <a
              href={`https://starkscan.co/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-accent hover:underline block mb-8"
            >
              {txHash.slice(0, 18)}…{txHash.slice(-6)}
            </a>
          )}
          <button
            onClick={() => navigate("/")}
            className="text-sm text-zinc-500 hover:text-white transition-colors font-mono"
          >
            open app →
          </button>
        </div>
      </div>
    );
  }

  // ── Main claim view ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="200" rx="24" fill="#0B0B0B" />

            <path
              d="M50 60H150L50 140H150"
              stroke="#00E5FF"
              stroke-width="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <path
              d="M60 60L140 140M140 60L60 140"
              stroke="#00E5FF"
              stroke-width="6"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <span className="text-base font-semibold text-white tracking-tight">
          Zap<span className="text-accent">-X</span>
        </span>
      </div>

      <div className="w-full max-w-sm animate-slide-up">
        <p className="text-xs font-mono text-zinc-600 mb-3 text-center">
          incoming transfer
        </p>

        {/* Amount */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-8 text-center mb-4">
          <p className="text-5xl font-semibold text-white mb-1 font-mono">
            {claim.amount}
          </p>
          <p className="text-accent font-mono text-lg">{claim.tokenType}</p>
          <p className="text-xs text-zinc-700 mt-3 font-mono">on Starknet</p>
        </div>

        {/* Status badges */}
        {claim.status !== "pending" && (
          <div
            className={`px-4 py-2.5 rounded-lg text-xs font-mono text-center mb-3 border ${
              claim.status === "claimed"
                ? "bg-green-500/5 border-green-500/20 text-green-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-500"
            }`}
          >
            already {claim.status}
          </div>
        )}

        {isExpired && claim.status === "pending" && (
          <div className="px-4 py-2.5 rounded-lg text-xs font-mono text-center mb-3 bg-red-500/5 border border-red-500/20 text-red-400">
            expired
          </div>
        )}

        {claim.status === "pending" && !isExpired && (
          <p className="text-xs font-mono text-zinc-700 text-center mb-5">
            expires{" "}
            {new Date(claim.expiresAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}

        {/* Actions */}
        {claim.status === "pending" &&
          !isExpired &&
          (isAuthenticated ? (
            <div className="space-y-3">
              <div className="px-4 py-3 bg-surface-card border border-surface-border rounded-lg flex items-center gap-2">
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${walletAddress ? "bg-accent animate-pulse-slow" : "bg-yellow-400 animate-pulse"}`}
                />
                <span className="font-mono text-xs text-zinc-400 truncate">
                  {walletAddress
                    ? `${walletAddress.slice(0, 14)}…${walletAddress.slice(-8)}`
                    : "setting up wallet…"}
                </span>
              </div>
              <button
                onClick={handleClaim}
                disabled={claiming || isWalletConnecting || !walletAddress}
                className="w-full py-3 bg-accent text-black font-semibold rounded-lg text-sm hover:bg-accent-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {claiming
                  ? "Claiming…"
                  : isWalletConnecting || !walletAddress
                    ? "Setting up wallet…"
                    : `Claim ${claim.amount} ${claim.tokenType}`}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 text-center font-mono">
                connect a wallet to claim — we'll create one if you don't have
                one
              </p>
              <button
                onClick={login}
                className="w-full py-3 bg-accent text-black font-semibold rounded-lg text-sm hover:bg-accent-dim transition-colors"
              >
                Connect / Create Wallet
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
