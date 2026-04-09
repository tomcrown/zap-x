/**
 * PrivateTransferFlow
 *
 * Shows a 3-step progress indicator while a confidential Tongo transfer executes:
 *   1. Initialising  — fetching Tongo key, deriving keypair, reading on-chain state
 *   2. Funding       — depositing public tokens into the Tongo contract (only when needed)
 *   3. Transferring  — submitting the ZK-proven confidential transfer
 *
 * Used inside both SendForm (direct send) and AIExecutor (AI-parsed command).
 */

import type { PrivateTransferStep } from "../../lib/starkzap.js";

interface StepDef {
  key: PrivateTransferStep | "done" | "error";
  label: string;
  sublabel: string;
}

const STEPS: StepDef[] = [
  {
    key: "initializing",
    label: "Initialising private account",
    sublabel: "Fetching your Tongo key & checking confidential balance",
  },
  {
    key: "funding",
    label: "Funding private balance",
    sublabel: "Moving tokens into your encrypted Tongo vault (tx 1/2)",
  },
  {
    key: "transferring",
    label: "Sending privately",
    sublabel: "Generating ZK proof and submitting confidential transfer",
  },
];

interface Props {
  currentStep: PrivateTransferStep;
  /** Whether the funding step is actually needed (skip its display when false) */
  needsFunding?: boolean;
  fundTxHash?: string;
  transferTxHash?: string;
  error?: string;
}

function StepIcon({
  state,
}: {
  state: "pending" | "active" | "done" | "skipped";
}) {
  if (state === "done") {
    return (
      <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/40 flex items-center justify-center shrink-0">
        <svg
          className="w-4 h-4 text-accent animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }
  if (state === "skipped") {
    return (
      <div className="w-8 h-8 rounded-full bg-surface border border-surface-border flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  // pending
  return (
    <div className="w-8 h-8 rounded-full bg-surface border border-surface-border flex items-center justify-center shrink-0">
      <div className="w-2 h-2 rounded-full bg-zinc-700" />
    </div>
  );
}

export function PrivateTransferFlow({
  currentStep,
  needsFunding = false,
  fundTxHash,
  transferTxHash,
  error,
}: Props) {
  const stepOrder: PrivateTransferStep[] = ["initializing", "funding", "transferring"];
  const currentIdx = stepOrder.indexOf(currentStep);

  function getState(stepKey: PrivateTransferStep): "pending" | "active" | "done" | "skipped" {
    if (stepKey === "funding" && !needsFunding) {
      // Show as skipped when no funding tx was needed
      if (currentIdx > stepOrder.indexOf("funding")) return "skipped";
      return "skipped";
    }
    const idx = stepOrder.indexOf(stepKey);
    if (transferTxHash && stepKey === "transferring") return "done";
    if (transferTxHash) return "done";
    if (idx < currentIdx) return "done";
    if (idx === currentIdx) return "active";
    return "pending";
  }

  return (
    <div className="space-y-1 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
          <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <span className="text-xs font-mono font-semibold text-purple-400 uppercase tracking-widest">
          Private Transfer
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {STEPS.map((step) => {
          const state = getState(step.key as PrivateTransferStep);
          const isSkipped = state === "skipped";
          return (
            <div key={step.key} className={`flex items-start gap-3 transition-opacity ${isSkipped ? "opacity-30" : "opacity-100"}`}>
              <StepIcon state={state} />
              <div className="flex-1 min-w-0 pt-1">
                <p className={`text-sm font-medium leading-tight ${state === "active" ? "text-white" : state === "done" ? "text-zinc-300" : "text-zinc-600"}`}>
                  {step.label}
                  {step.key === "funding" && !needsFunding && (
                    <span className="ml-2 text-xs text-zinc-700">(not needed)</span>
                  )}
                </p>
                {state === "active" && (
                  <p className="text-xs text-zinc-500 mt-0.5">{step.sublabel}</p>
                )}
                {/* Show tx hash when done */}
                {state === "done" && step.key === "funding" && fundTxHash && (
                  <a
                    href={`https://starkscan.co/tx/${fundTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-accent/70 hover:text-accent transition-colors"
                  >
                    {fundTxHash.slice(0, 10)}…{fundTxHash.slice(-6)} ↗
                  </a>
                )}
                {state === "done" && step.key === "transferring" && transferTxHash && (
                  <a
                    href={`https://starkscan.co/tx/${transferTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-accent/70 hover:text-accent transition-colors"
                  >
                    {transferTxHash.slice(0, 10)}…{transferTxHash.slice(-6)} ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400 font-mono leading-snug">{error}</p>
        </div>
      )}

      {/* Privacy note */}
      {!error && (
        <p className="text-[11px] text-zinc-700 font-mono mt-3 flex items-center gap-1.5">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
          Amount &amp; recipient hidden on-chain via Tongo ZK proofs
        </p>
      )}
    </div>
  );
}
