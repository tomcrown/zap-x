import React, { useState, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
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

// ── Animated three-node background ───────────────────────────────────────────
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

      {/* SVG nodes + connecting lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.18]"
        preserveAspectRatio="none"
      >
        <defs>
          <marker id="dot" markerWidth="4" markerHeight="4" refX="2" refY="2">
            <circle cx="2" cy="2" r="1.5" fill="#22d3ee" />
          </marker>
        </defs>

        {/* Lines — approximate positions; purely decorative */}
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
      </svg>

      {/* Node 1 — top left */}
      <div className="node-1 absolute" style={{ top: "19%", left: "14%" }}>
        <div className="relative">
          <div className="w-3 h-3 rounded-full border border-accent/60 bg-accent/10" />
          <div
            className="absolute inset-0 rounded-full border border-accent/20 scale-150 animate-ping"
            style={{ animationDuration: "3s" }}
          />
        </div>
      </div>

      {/* Node 2 — bottom right */}
      <div className="node-2 absolute" style={{ top: "55%", right: "18%" }}>
        <div className="relative">
          <div className="w-2 h-2 rounded-full border border-accent/40 bg-accent/10" />
        </div>
      </div>

      {/* Node 3 — center right */}
      <div className="node-3 absolute" style={{ top: "16%", right: "22%" }}>
        <div className="relative">
          <div className="w-2.5 h-2.5 rounded-full border border-accent/50 bg-accent/10" />
          <div
            className="absolute inset-0 rounded-full border border-accent/15 scale-150 animate-ping"
            style={{ animationDuration: "4s", animationDelay: "1s" }}
          />
        </div>
      </div>
    </div>
  );
}

const EXAMPLES = [
  '"Send 5 STRK to tony@gmail.com"',
  '"Swap 1 ETH to USDC"',
  '"Save 50 USDC and start earning yield"',
  '"Send 0.001 BTC to alex@email.com"',
  '"What\'s my current balance?"',
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
    desc: "Type an email address. If the recipient has no wallet, we escrow the funds and send them a claim link. They create a free wallet in 30 seconds and collect. No crypto knowledge required.",
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
    desc: "Every single transaction is completely gasless. AVNU's paymaster covers all fees. You never need to top up for gas.",
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
      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
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
          <span className="text-lg font-semibold text-white">
            Zap<span className="text-accent">-X</span>
          </span>
        </div>
        <button
          onClick={login}
          disabled={isLoading}
          className="px-5 py-2 bg-accent text-black font-semibold rounded-lg text-sm hover:bg-accent-dim transition-colors disabled:opacity-40"
        >
          {isLoading ? "Loading…" : "Get started"}
        </button>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-24 min-h-[90vh]">
        <NodeBackground />

        {/* Status pill */}
        <div
          data-reveal
          className="relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/25 bg-accent/5 text-accent text-xs font-mono mb-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          Live on Starknet Mainnet
        </div>

        {/* Headline */}
        <h1
          data-reveal
          data-delay="1"
          className="relative z-10 text-6xl sm:text-7xl md:text-8xl lg:text-[108px] font-bold text-white leading-[0.92] tracking-tight mb-4"
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
          Swap, save, and manage your portfolio through a single chat.
        </p>

        {/* Animated example */}
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
        </div>
      </section>

      {/* ── Email wow section ─────────────────────────────────────────────── */}
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

            {/* Right: flow diagram */}
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
                  desc: "Google login, wallet created in seconds. Zero setup.",
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
                  className="flex items-center gap-4 px-5 py-4 bg-surface border border-surface-border rounded-xl"
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

      {/* ── Features grid ─────────────────────────────────────────────────── */}
      <section className="border-t border-surface-border">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div data-reveal className="mb-14 text-center">
            <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest">
              Everything in one chat
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                data-delay={String(i + 1) as any}
                className={`space-y-3 p-5 rounded-xl border transition-colors ${
                  f.highlight
                    ? "bg-accent/5 border-accent/20"
                    : "bg-surface-card border-surface-border"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    f.highlight
                      ? "bg-accent/10 text-accent"
                      : "bg-surface border border-surface-border text-zinc-500"
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
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="border-t border-surface-border bg-surface-card">
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
                desc: "Tell the AI what you want. Send tokens, swap, earn yield — all from plain English. No forms, no clicking through menus.",
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
          <p className="text-zinc-500 text-sm mb-10 font-mono">
            Starknet · Starkzap · AVNU · Vesu · Privy · Ekubo
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
