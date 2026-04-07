import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transferApi } from "../../lib/api.js";
import { executeTransfer } from "../../lib/starkzap.js";
import { useWallet } from "../../contexts/WalletContext.js";
import { useToast } from "../../contexts/ToastContext.js";
import { RecipientSearch } from "./RecipientSearch.js";
import { Button } from "../common/Button.js";
import { Select } from "../common/Input.js";
import { TokenSymbol, ParsedAction } from "../../types/index.js";

const TOKEN_OPTIONS = [
  { value: "STRK", label: "STRK — Starknet Token" },
  { value: "ETH", label: "ETH — Ethereum" },
  { value: "USDC", label: "USDC — USD Coin" },
  { value: "USDT", label: "USDT — Tether" },
  { value: "wBTC", label: "wBTC — Wrapped Bitcoin" },
];

interface Props {
  prefill?: Partial<ParsedAction>;
  onSuccess?: () => void;
}

export function SendForm({ prefill, onSuccess }: Props) {
  const { walletAddress, balances } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [recipient, setRecipient] = useState(prefill?.recipient ?? "");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [token, setToken] = useState<TokenSymbol>(
    (prefill?.token ?? "STRK") as TokenSymbol,
  );
  const [note, setNote] = useState(prefill?.note ?? "");
  const [gasless, setGasless] = useState(true);
  const [step, setStep] = useState<"form" | "confirming" | "done">("form");
  const [txHash, setTxHash] = useState("");
  const [claimLink, setClaimLink] = useState("");

  const availableBalance = parseFloat(balances[token] ?? "0");

  const handleMax = () => {
    setAmount(availableBalance.toFixed(6));
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) throw new Error("Wallet not connected.");
      if (!amount || parseFloat(amount) <= 0)
        throw new Error("Enter a valid amount.");
      if (!recipient.trim()) throw new Error("Enter a recipient.");

      setStep("confirming");

      // Step 1: Ask backend to resolve recipient and get target address
      const prep = await transferApi.prepare({
        senderWallet: walletAddress,
        recipient,
        amount,
        token,
        note: note || undefined,
        gasless,
      });

      // Step 2: Execute on-chain transfer via Starkzap SDK
      const hash = await executeTransfer({
        toAddress: prep.toAddress,
        amount,
        token,
        gasless,
      });

      setTxHash(hash);

      // Step 3: Tell backend to record it (and send claim email if escrow)
      const confirmed = await transferApi.confirm({
        senderWallet: walletAddress,
        recipient,
        amount,
        token,
        txHash: hash,
        note: note || undefined,
        recipientEmail: prep.recipientEmail,
        needsEscrow: prep.needsEscrow,
      });

      if (confirmed.claimLink) {
        setClaimLink(confirmed.claimLink);
      }

      return confirmed;
    },
    onSuccess: (data) => {
      setStep("done");
      toast({
        type: "success",
        title: "Transfer submitted!",
        message: data.message,
        txHash: data.txHash,
      });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["claim-links"] });
      onSuccess?.();
    },
    onError: (err: Error) => {
      setStep("form");
      toast({ type: "error", title: "Transfer failed", message: err.message });
    },
  });

  if (step === "done") {
    return (
      <div className="text-center py-8 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-green-400"
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
        <h3 className="text-xl font-bold text-white mb-2">Transfer Sent!</h3>
        <p className="text-slate-400 text-sm mb-4">
          {amount} {token} has been {claimLink ? "delivered" : "sent"}
        </p>
        {txHash && (
          <a
            href={`https://starkscan.co/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:underline text-sm font-mono block mb-4"
          >
            View on Starkscan →
          </a>
        )}
        {claimLink && (
          <div className="p-4 bg-surface rounded-xl border border-brand-500/30 text-left mb-4">
            <p className="text-xs font-semibold text-brand-400 mb-2">
              📎 Share this claim link with the recipient
            </p>
            <p className="text-xs font-mono text-slate-300 break-all mb-3">
              {claimLink}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(claimLink)}
              className="w-full py-2 rounded-lg bg-brand-600/20 border border-brand-500/30 text-xs text-brand-400 hover:bg-brand-600/30 transition-colors font-semibold"
            >
              Copy claim link
            </button>
            <p className="text-xs text-slate-500 mt-2">
              They can claim their funds without a wallet — Privy handles it.
            </p>
          </div>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setStep("form");
            setRecipient("");
            setAmount("");
            setNote("");
            setTxHash("");
            setClaimLink("");
          }}
        >
          Send Another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <RecipientSearch
        value={recipient}
        onChange={setRecipient}
        onResolved={setResolvedAddress}
      />

      {/* Amount + Token */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input pr-16 font-mono"
            />
            <button
              onClick={handleMax}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 hover:text-brand-300 font-semibold"
            >
              MAX
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Available:{" "}
            <span className="font-mono">
              {availableBalance.toFixed(4)} {token}
            </span>
          </p>
        </div>

        <div className="w-36">
          <Select
            label="Token"
            value={token}
            onChange={(e) => setToken(e.target.value as TokenSymbol)}
            options={TOKEN_OPTIONS}
          />
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Note <span className="text-slate-500">(optional)</span>
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="What's this for?"
          className="input"
        />
      </div>

      {/* Gasless toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-surface-border hover:bg-surface-hover transition-colors">
        <div className="relative">
          <input
            type="checkbox"
            checked={gasless}
            onChange={(e) => setGasless(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-border rounded-full peer peer-checked:bg-brand-600 transition-colors" />
          <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-200">
            Gasless Transaction
          </p>
          <p className="text-xs text-slate-500">
            Powered by AVNU Paymaster — no ETH/STRK needed for gas
          </p>
        </div>
      </label>

      <Button
        onClick={() => sendMutation.mutate()}
        loading={sendMutation.isPending || step === "confirming"}
        disabled={!recipient.trim() || !amount || parseFloat(amount) <= 0}
        className="w-full"
        size="lg"
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        }
      >
        {step === "confirming"
          ? "Waiting for signature…"
          : `Send ${amount || "0"} ${token}`}
      </Button>
    </div>
  );
}
