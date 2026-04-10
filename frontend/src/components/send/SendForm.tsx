import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transferApi, privateTransferApi } from "../../lib/api.js";
import {
  executeTransfer,
  executePrivateTransfer,
  isPrivateTransferSupported,
  PRIVATE_TRANSFER_TOKENS,
} from "../../lib/starkzap.js";
import { useWallet } from "../../contexts/WalletContext.js";
import { useToast } from "../../contexts/ToastContext.js";
import { RecipientSearch } from "./RecipientSearch.js";
import { PrivateTransferFlow } from "./PrivateTransferFlow.js";
import { Button } from "../common/Button.js";
import { Select } from "../common/Input.js";
import type { TokenSymbol, ParsedAction } from "../../types/index.js";
import type { PrivateTransferStep } from "../../lib/starkzap.js";

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
  const [sendPrivately, setSendPrivately] = useState(prefill?.private ?? false);
  const [step, setStep] = useState<"form" | "confirming" | "done">("form");
  const [txHash, setTxHash] = useState("");
  const [claimLink, setClaimLink] = useState("");
  const [privateStep, setPrivateStep] =
    useState<PrivateTransferStep>("initializing");
  const [fundTxHash, setFundTxHash] = useState<string | undefined>();
  const [privateError, setPrivateError] = useState<string | undefined>();

  const availableBalance = parseFloat(balances[token] ?? "0");
  const privateSupported = isPrivateTransferSupported(token);

  const handleMax = () => setAmount(availableBalance.toFixed(6));

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) throw new Error("Wallet not connected.");
      if (!amount || parseFloat(amount) <= 0)
        throw new Error("Enter a valid amount.");
      if (!recipient.trim()) throw new Error("Enter a recipient.");

      setStep("confirming");

      if (sendPrivately && privateSupported) {
        setPrivateStep("initializing");
        setFundTxHash(undefined);
        setPrivateError(undefined);

        const prep = await privateTransferApi.prepare(recipient);

        const result = await executePrivateTransfer(
          {
            recipientKey: prep.recipientKey,
            amount,
            token,
            gasless,
          },
          (s) => {
            setPrivateStep(s);
            if (s === "transferring" && fundTxHash === undefined) {
            }
          },
        );

        if (result.fundTxHash) setFundTxHash(result.fundTxHash);
        setTxHash(result.transferTxHash);

        await privateTransferApi.confirm({
          senderWallet: walletAddress,
          recipient,
          amount,
          token,
          transferTxHash: result.transferTxHash,
          fundTxHash: result.fundTxHash,
          note: note || undefined,
        });

        return { isPrivate: true };
      } else {
        const prep = await transferApi.prepare({
          senderWallet: walletAddress,
          recipient,
          amount,
          token,
          note: note || undefined,
          gasless,
        });

        const hash = await executeTransfer({
          toAddress: prep.toAddress,
          amount,
          token,
          gasless,
        });

        setTxHash(hash);

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

        if (confirmed.claimLink) setClaimLink(confirmed.claimLink);
        return { isPrivate: false };
      }
    },
    onSuccess: (data) => {
      setStep("done");
      toast({
        type: "success",
        title: data.isPrivate
          ? "Private transfer sent!"
          : "Transfer submitted!",
        message: data.isPrivate
          ? "Amount and recipient are hidden on-chain."
          : claimLink
            ? `A claim link was sent.`
            : `${amount} ${token} sent.`,
        txHash,
      });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["claim-links"] });

      onSuccess?.();
    },
    onError: (err: Error) => {
      setStep("form");
      setPrivateError(err.message);
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
        <h3 className="text-xl font-bold text-white mb-2">
          {sendPrivately ? "Private Transfer Sent!" : "Transfer Sent!"}
        </h3>
        <p className="text-slate-400 text-sm mb-1">
          {amount} {token} {claimLink ? "delivered via claim link" : "sent"}
        </p>
        {sendPrivately && (
          <p className="text-purple-400 text-xs font-mono mb-4">
            Amount &amp; recipient hidden on-chain
          </p>
        )}
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
              Share this claim link with the recipient
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
            setFundTxHash(undefined);
            setSendPrivately(prefill?.private ?? false);
          }}
        >
          Send Another
        </Button>
      </div>
    );
  }

  if (step === "confirming" && sendPrivately) {
    return (
      <div className="animate-fade-in">
        <PrivateTransferFlow
          currentStep={privateStep}
          needsFunding={!!fundTxHash}
          fundTxHash={fundTxHash}
          transferTxHash={txHash || undefined}
          error={privateError}
        />
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
            onChange={(e) => {
              const next = e.target.value as TokenSymbol;
              setToken(next);
              if (!isPrivateTransferSupported(next)) setSendPrivately(false);
            }}
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

      {/* Private transfer toggle */}
      {privateSupported ? (
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-purple-500/20 hover:bg-purple-500/5 transition-colors">
          <div className="relative mt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={sendPrivately}
              onChange={(e) => setSendPrivately(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-border rounded-full peer peer-checked:bg-purple-600 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Send Privately
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Amount &amp; recipient hidden on-chain via Tongo ZK proofs
            </p>
            {sendPrivately && (
              <p className="text-xs text-purple-400/80 mt-1 font-mono">
                Recipient must have a Zap-X account with private transfers
                activated
              </p>
            )}
          </div>
        </label>
      ) : (
        token !== "STRK" &&
        token !== "ETH" &&
        token !== "USDC" && (
          <p className="text-xs text-zinc-600 font-mono px-1">
            Private transfers available for {PRIVATE_TRANSFER_TOKENS.join(", ")}{" "}
            only
          </p>
        )
      )}

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
        className={`w-full ${sendPrivately ? "!bg-purple-600 hover:!bg-purple-500" : ""}`}
        size="lg"
        icon={
          sendPrivately ? (
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          ) : (
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
          )
        }
      >
        {step === "confirming"
          ? sendPrivately
            ? "Generating ZK proof…"
            : "Waiting for signature…"
          : sendPrivately
            ? `Send ${amount || "0"} ${token} privately`
            : `Send ${amount || "0"} ${token}`}
      </Button>
    </div>
  );
}
