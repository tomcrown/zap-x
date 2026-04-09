import React, { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext.js";

// ── Scroll reveal hook ────────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("revealed");
        }),
      { threshold: 0.12 },
    );
    document
      .querySelectorAll("[data-reveal]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ── Animated node background ──────────────────────────────────────────────────
function NodeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #27272a 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* SVG connecting lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.18]"
        preserveAspectRatio="none"
      >
        <line
          x1="15%"
          y1="22%"
          x2="52%"
          y2="38%"
          stroke="#22d3ee"
          strokeWidth="0.5"
        />
        <line
          x1="52%"
          y1="38%"
          x2="78%"
          y2="18%"
          stroke="#22d3ee"
          strokeWidth="0.5"
        />
        <line
          x1="15%"
          y1="22%"
          x2="78%"
          y2="18%"
          stroke="#22d3ee"
          strokeWidth="0.5"
        />
        <line
          x1="52%"
          y1="38%"
          x2="62%"
          y2="72%"
          stroke="#22d3ee"
          strokeWidth="0.5"
        />
      </svg>

      {/* Node 1 — top left */}
      <div className="absolute" style={{ top: "19%", left: "14%" }}>
        <div className="relative">
          <div className="w-3 h-3 rounded-full border border-accent/60 bg-accent/10" />
          <div
            className="absolute inset-0 rounded-full border border-accent/20 scale-150 animate-ping"
            style={{ animationDuration: "3s" }}
          />
        </div>
      </div>

      {/* Node 2 — bottom right */}
      <div className="absolute" style={{ top: "55%", right: "18%" }}>
        <div className="w-2 h-2 rounded-full border border-accent/40 bg-accent/10" />
      </div>

      {/* Node 3 — top right */}
      <div className="absolute" style={{ top: "16%", right: "22%" }}>
        <div className="relative">
          <div className="w-2.5 h-2.5 rounded-full border border-accent/50 bg-accent/10" />
          <div
            className="absolute inset-0 rounded-full border border-accent/15 scale-150 animate-ping"
            style={{ animationDuration: "4s", animationDelay: "1s" }}
          />
        </div>
      </div>

      {/* Node 4 — bottom left */}
      <div className="absolute" style={{ top: "70%", left: "22%" }}>
        <div className="w-2 h-2 rounded-full border border-accent/30 bg-accent/10" />
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const EXAMPLES = [
  '"Send 5 STRK to tony@gmail.com"',
  '"Swap 1 ETH to USDC"',
  '"Send 50 USDC privately to alex@email.com"',
  '"Save 50 USDC and start earning yield"',
  '"Send 0.001 BTC to sarah@email.com"',
  '"What\'s my current balance?"',
  '"Stake 100 STRK and earn yield"',
];

const FEATURES = [
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    title: "Send to any email",
    desc: "No wallet required. We escrow funds and email a claim link. They claim in 30 seconds with Google login — no seed phrases, no extensions.",
    highlight: true,
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
    title: "Private transfers",
    desc: "ElGamal encryption + ZK proofs via Tongo. Amount and recipient hidden on-chain. Works with wallet addresses and emails alike.",
    highlight: true,
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    title: "Zero gas fees",
    desc: "Every transaction is completely gasless. AVNU's paymaster covers all fees. You never need to top up for gas.",
    highlight: false,
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
    title: "Instant swaps",
    desc: "Swap STRK, ETH, USDC, and Bitcoin at the best available rates through AVNU. All from a chat message.",
    highlight: false,
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1"
        />
      </svg>
    ),
    title: "Earn yield",
    desc: 'Lend tokens on Vesu protocol and earn interest automatically. Just say "save 50 USDC" and it\'s done.',
    highlight: false,
  },
];

const TOKENS = [
  { symbol: "STRK", color: "#e2a63c" },
  { symbol: "USDC", color: "#2775ca" },
  { symbol: "ETH", color: "#627eea" },
  { symbol: "BTC", color: "#f7931a" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useWallet();
  const [exampleIdx, setExampleIdx] = useState(0);
  useScrollReveal();

  useEffect(() => {
    const t = setInterval(
      () => setExampleIdx((i) => (i + 1) % EXAMPLES.length),
      3000,
    );
    return () => clearInterval(t);
  }, []);

  if (!isLoading && isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
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
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M60 60L140 140M140 60L60 140"
                stroke="#00E5FF"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold text-white">
            Zap<span className="text-accent">-X</span>
          </span>
        </div>

        {/* Links */}
        <div className="hidden sm:flex items-center gap-7">
          <Link
            to="/docs"
            className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Docs
          </Link>
          <a
            href="#features"
            className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            How it works
          </a>
        </div>

        <button
          onClick={login}
          disabled={isLoading}
          className="px-5 py-2 bg-accent text-black font-bold rounded-lg text-sm hover:bg-accent-dim transition-colors disabled:opacity-40"
        >
          {isLoading ? "Loading…" : "Get started"}
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-24 min-h-[92vh]">
        <NodeBackground />

        {/* Status pill */}
        <div
          data-reveal
          className="relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/25 bg-accent/5 text-accent text-xs font-mono mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          Live on Starknet Mainnet
        </div>

        {/* Headline */}
        <h1
          data-reveal
          data-delay="1"
          className="relative z-10 text-6xl sm:text-7xl md:text-8xl lg:text-[108px] font-bold text-white leading-[0.92] tracking-tight mb-6"
        >
          The AI wallet
          <br />
          <span className="text-accent">that listens.</span>
        </h1>

        {/* Sub */}
        <p
          data-reveal
          data-delay="2"
          className="relative z-10 text-lg sm:text-xl text-zinc-400 max-w-xl mx-auto mb-4 leading-relaxed"
        >
          Send tokens to anyone's email — no wallet needed on their end.
          <br />
          Swap, save, stake, and send privately through a single chat.
        </p>

        {/* Animated example ticker */}
        <div
          data-reveal
          data-delay="3"
          className="relative z-10 h-8 mb-10 flex items-center justify-center"
        >
          <span
            key={exampleIdx}
            className="font-mono text-sm text-zinc-600 animate-fade-in"
          >
            {EXAMPLES[exampleIdx]}
          </span>
        </div>

        {/* CTA */}
        <div
          data-reveal
          data-delay="4"
          className="relative z-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <button
            onClick={login}
            disabled={isLoading}
            className="px-12 py-4 bg-accent text-black font-bold text-lg rounded-xl hover:bg-accent-dim transition-colors disabled:opacity-40 min-w-[220px]"
          >
            {isLoading ? "Loading…" : "Start chatting →"}
          </button>
          <a
            href="#how-it-works"
            className="px-8 py-4 bg-transparent text-zinc-400 font-medium text-base rounded-xl border border-zinc-800 hover:border-zinc-600 hover:text-white transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* Tech strip */}
        <div
          data-reveal
          data-delay="4"
          className="relative z-10 mt-14 flex items-center gap-2 font-mono text-[11px] text-white-800 flex-wrap justify-center"
        >
          {["Starknet", "Starkzap", "AVNU", "Privy", "Tongo", "Vesu"].map(
            (t, i, arr) => (
              <React.Fragment key={t}>
                <span>{t}</span>
                {i < arr.length - 1 && (
                  <span className="text-white-900">·</span>
                )}
              </React.Fragment>
            ),
          )}
        </div>
      </section>

      {/* ── Email section ────────────────────────────────────────────────── */}
      <section className="border-t border-surface-border bg-surface-card">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div
            data-reveal
            className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center"
          >
            {/* Left: copy */}
            <div className="lg:w-1/2">
              <p className="text-xs font-mono text-accent uppercase tracking-widest mb-5">
                The feature no one else has
              </p>
              <h2 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6">
                Send money to
                <br />
                anyone's email.
              </h2>
              <p className="text-zinc-400 leading-relaxed mb-4">
                Your recipient doesn't need a crypto wallet. Just type their
                email address.
              </p>
              <p className="text-zinc-400 leading-relaxed mb-4">
                They get an email with a claim link. They sign up with their
                Google account. A Starknet wallet is created for them
                automatically — no seed phrases, no extensions.
              </p>
              <p className="text-zinc-400 leading-relaxed">
                They hit "Claim" and the funds land instantly.{" "}
                <strong className="text-white">That's it.</strong>
              </p>
            </div>

            {/* Right: flow steps */}
            <div className="lg:w-1/2 w-full space-y-3">
              {[
                {
                  step: "01",
                  icon: "→",
                  label: "You type",
                  desc: '"Send 10 STRK to tony@gmail.com"',
                },
                {
                  step: "02",
                  icon: "✉",
                  label: "Tony gets an email",
                  desc: "A claim link lands in his inbox. No crypto account needed.",
                },
                {
                  step: "03",
                  icon: "⚡",
                  label: "Tony signs in",
                  desc: "Google login, wallet created in seconds. Zero setup. Gasless",
                },
                {
                  step: "04",
                  icon: "✓",
                  label: "Funds claimed",
                  desc: "10 STRK hits his wallet on Starknet.",
                },
              ].map((s, i) => (
                <div
                  key={s.step}
                  data-reveal
                  data-delay={String(i + 1) as any}
                  className="flex items-center gap-4 px-5 py-4 bg-surface border border-surface-border rounded-xl hover:border-accent/20 transition-colors"
                >
                  <span className="text-xs font-mono text-zinc-700 shrink-0 w-8">
                    {s.step}
                  </span>
                  <span className="text-lg shrink-0 w-8 text-center">
                    {s.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {s.label}
                    </p>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {s.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Private transfers section ─────────────────────────────────────── */}
      <section className="border-t border-surface-border">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
            {/* Left: flow steps */}
            <div className="lg:w-1/2 w-full space-y-3 order-2 lg:order-1">
              {[
                {
                  step: "01",
                  label: "Enable private mode",
                  desc: "Toggle once — Tongo key auto-generated for you",
                },
                {
                  step: "02",
                  label: "Amount encrypted",
                  desc: "ElGamal + ZK proof wraps your transfer on-chain",
                },
                {
                  step: "03",
                  label: "On-chain, invisible",
                  desc: "Transaction recorded — amount & recipient hidden",
                },
                {
                  step: "04",
                  label: "Recipient decrypts",
                  desc: "Only they can see the details and claim funds",
                },
              ].map((s, i) => (
                <div
                  key={s.step}
                  data-reveal
                  data-delay={String(i + 1) as any}
                  className="flex items-center gap-4 px-5 py-4 bg-surface-card border border-surface-border rounded-xl hover:border-accent/20 transition-colors"
                >
                  <span className="text-xs font-mono text-zinc-700 shrink-0 w-8">
                    {s.step}
                  </span>
                  <span className="text-lg shrink-0 w-8 text-center"></span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {s.label}
                    </p>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {s.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: copy */}
            <div className="lg:w-1/2 order-1 lg:order-2" data-reveal>
              <p className="text-xs font-mono text-accent uppercase tracking-widest mb-5">
                Confidential transfers
              </p>
              <h2 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6">
                Your business
                <br />
                stays yours.
              </h2>
              <p className="text-zinc-400 leading-relaxed mb-4">
                Standard blockchain transfers expose every amount and address
                publicly. With Zap-X private mode, nothing leaks — not the
                amount, not who you're paying.
              </p>
              <p className="text-zinc-400 leading-relaxed mb-6">
                Works with wallet addresses and email recipients alike. Only you
                and your recipient can decrypt the transfer details.
              </p>

              {/* Crypto badges */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "ElGamal encryption", accent: true },
                  { label: "ZK proofs", accent: true },
                  { label: "Hidden amount", accent: false },
                  { label: "Hidden recipient", accent: false },
                  { label: "Tongo Protocol", accent: false },
                ].map((b) => (
                  <span
                    key={b.label}
                    className={`px-3 py-1 rounded-full text-xs font-mono border ${
                      b.accent
                        ? "bg-accent/10 text-accent border-accent/20"
                        : "bg-surface-card text-zinc-500 border-surface-border"
                    }`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────────── */}
      <section
        id="features"
        className="border-t border-surface-border bg-surface-card"
      >
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div data-reveal className="mb-14 text-center">
            <p className="text-lg font-mono text-white-600 uppercase tracking-widest mb-3">
              Everything in one chat
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                data-delay={String(i + 1) as any}
                className={`space-y-3 p-5 rounded-xl border transition-colors ${
                  f.highlight
                    ? "bg-accent/5 border-accent/20"
                    : "bg-surface border-surface-border"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    f.highlight
                      ? "bg-accent/10 text-accent"
                      : "bg-surface-card border border-surface-border text-zinc-500"
                  }`}
                >
                  {f.icon}
                </div>
                <h3
                  className={`font-semibold text-sm ${f.highlight ? "text-accent" : "text-white"}`}
                >
                  {f.title}
                </h3>
                <p className="text-zinc-600 text-xs leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Supported tokens */}
          <div
            data-reveal
            className="mt-12 pt-10 border-t border-surface-border flex items-center gap-3 flex-wrap"
          >
            <span className="text-xs font-mono text-zinc-700 mr-1">
              Supported
            </span>
            {TOKENS.map((t) => (
              <div
                key={t.symbol}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-surface-border rounded-full"
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-xs font-semibold text-zinc-400">
                  {t.symbol}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-surface-border">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div data-reveal className="mb-14">
            <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-4xl font-bold text-white">Three steps.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {[
              {
                step: "01",
                title: "Connect",
                desc: "Sign in with email or Google. A Starknet wallet is created automatically. No seed phrases, no extensions, no complexity.",
              },
              {
                step: "02",
                title: "Chat",
                desc: "Tell the AI what you want. Send tokens, swap, stake, earn yield, or send privately — all from plain English.",
              },
              {
                step: "03",
                title: "Confirm",
                desc: "Review the action card and hit confirm. Gasless execution on Starknet in seconds.",
              },
            ].map((s, i) => (
              <div
                key={s.step}
                data-reveal
                data-delay={String(i + 1) as any}
                className="flex gap-6"
              >
                <span className="text-5xl font-bold text-zinc-800 font-mono shrink-0 leading-none">
                  {s.step}
                </span>
                <div>
                  <h3 className="text-white font-semibold text-lg mb-2">
                    {s.title}
                  </h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-surface-border relative overflow-hidden">
        <NodeBackground />
        <div
          data-reveal
          className="relative z-10 flex flex-col items-center text-center px-6 py-24"
        >
          <h2 className="text-5xl sm:text-6xl font-bold text-white mb-5">
            Ready to zap?
          </h2>
          <p className="text-white-600 text-sm mb-10 font-mono">
            Starknet · Starkzap · AVNU · Vesu · Privy · Tongo
          </p>
          <button
            onClick={login}
            disabled={isLoading}
            className="px-12 py-4 bg-accent text-black font-bold text-lg rounded-xl hover:bg-accent-dim transition-colors disabled:opacity-40"
          >
            {isLoading ? "Loading…" : "Get started →"}
          </button>
        </div>
      </section>
    </div>
  );
}
