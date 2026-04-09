import React, { useState } from "react";
import { Link } from "react-router-dom";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "tech-stack", label: "Tech stack" },
  { id: "integrations", label: "Integrations" },
  { id: "tokens", label: "Tokens" },
  { id: "api", label: "API reference" },
  { id: "local", label: "Running locally" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-5">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-white mb-3">{children}</h2>;
}

function Divider() {
  return <hr className="border-none border-t border-surface-border my-10" />;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-surface-card">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-[11px] font-mono text-zinc-600 uppercase tracking-widest border-b border-surface-border"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                i < rows.length - 1 ? "border-b border-surface-border" : ""
              }
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 ${
                    j === 0
                      ? "text-white font-mono text-xs"
                      : "text-zinc-500 text-xs"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Step({
  num,
  title,
  desc,
}: {
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4 px-4 py-3.5 bg-surface-card border border-surface-border rounded-xl mb-2">
      <span className="text-xs font-mono text-zinc-700 w-6 shrink-0 pt-0.5">
        {num}
      </span>
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
        <p className="text-xs text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-card border border-surface-border text-[11px] font-mono text-zinc-400 m-0.5">
      {children}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const styles: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-400",
    POST: "bg-blue-500/10 text-blue-400",
    PUT: "bg-amber-500/10 text-amber-400",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold mr-2 ${styles[method] ?? ""}`}
    >
      {method}
    </span>
  );
}

export function DocsPage() {
  const [active, setActive] = useState("overview");

  return (
    <div className="min-h-screen bg-surface font-sans">
      {/* Nav */}
      <nav className="h-14 border-b border-surface-border flex items-center justify-between px-5 sm:px-8 bg-surface z-10 sticky top-0">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
            <svg
              width="200"
              height="200"
              viewBox="0 0 200 200"
              fill="none"
              className="w-full h-full"
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
          <span className="text-sm font-semibold text-white">
            Zap<span className="text-accent">-X</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            app
          </Link>
          <span className="text-xs font-mono text-accent">docs</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="border-b border-surface-border px-5 sm:px-8 py-14 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/25 bg-accent/5 text-accent text-xs font-mono mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          Live on Starknet Mainnet
        </div>
        <h1 className="text-4xl font-bold text-white mb-3 leading-tight">
          Zap-X Documentation
        </h1>
        <p className="text-zinc-500 text-base leading-relaxed max-w-lg">
          Everything about how Zap-X works — features, integrations, API
          reference, and how to run it locally.
        </p>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 pb-24">
        <div className="flex gap-12 pt-12">
          {/* TOC */}
          <aside className="hidden lg:block w-44 shrink-0">
            <div className="sticky top-20">
              <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest mb-3">
                On this page
              </p>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={`block text-xs font-mono py-1 transition-colors ${
                    active === s.id
                      ? "text-accent"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {/* Overview */}
            <section id="overview" className="mb-12">
              <SectionLabel>Overview</SectionLabel>
              <SectionTitle>What is Zap-X?</SectionTitle>
              <p className="text-zinc-500 text-sm leading-relaxed mb-3">
                Zap-X is a non-custodial crypto transfer app built on Starknet.
                Send STRK to anyone — by wallet address or email — with no gas
                fees, no seed phrases, and no crypto knowledge required.
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                For recipients without a wallet, Zap-X creates one automatically
                and emails them a claim link. They click it, sign in with
                Google, and a Starknet wallet is created for them. No setup, no
                extensions.
              </p>
            </section>

            <Divider />

            {/* Features */}
            <section id="features" className="mb-12">
              <SectionLabel>Features</SectionLabel>
              <SectionTitle>What you can do</SectionTitle>
              <Table
                headers={["Feature", "Description"]}
                rows={[
                  [
                    "Send to anyone",
                    "Wallet address, @username, or email address",
                  ],
                  [
                    "Private transfers",
                    "On-chain confidential via Tongo/ElGamal encryption",
                  ],
                  [
                    "Auto-create wallets",
                    "Privy-managed Starknet wallet for new recipients",
                  ],
                  [
                    "Claim links",
                    "Unregistered recipients get an email claim link",
                  ],
                  ["Gasless", "All fees sponsored by AVNU Paymaster"],
                  [
                    "AI natural language",
                    "Google Gemini parses plain-English commands",
                  ],
                  ["Staking", "Stake STRK into Starknet native staking pools"],
                  ["Transaction history", "Full history with status tracking"],
                  [
                    "Email notifications",
                    "Confirmations for sender and recipient",
                  ],
                ]}
              />
            </section>

            <Divider />

            {/* How it works */}
            <section id="how-it-works" className="mb-12">
              <SectionLabel>How it works</SectionLabel>
              <SectionTitle>Sending tokens</SectionTitle>
              <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                Users sign in with email or Google via Privy — no wallet setup
                needed. The frontend calls{" "}
                <code className="text-accent font-mono text-xs">
                  /api/transfer/prepare
                </code>{" "}
                to resolve the recipient. If they have a wallet, funds go
                directly on-chain. If not, a claim link is generated.
              </p>

              <SectionTitle>Claim links</SectionTitle>
              <div className="mb-6">
                <Step
                  num="01"
                  title="Funds go to escrow"
                  desc="When the recipient has no wallet, tokens are held in the escrow wallet."
                />
                <Step
                  num="02"
                  title="Claim email sent"
                  desc="A unique link is emailed: zapx.vercel.app/claim/<token>"
                />
                <Step
                  num="03"
                  title="Recipient signs in"
                  desc="They sign in with Google — a Starknet wallet is created automatically. No seed phrases."
                />
                <Step
                  num="04"
                  title="Funds released"
                  desc="The backend releases escrow to their new wallet via a signed transfer."
                />
              </div>

              <SectionTitle>Private transfers</SectionTitle>
              <p className="text-zinc-500 text-sm leading-relaxed mb-2">
                Uses the Tongo protocol — ElGamal encryption with ZK proofs on
                Starknet. Both sender and recipient must have a Tongo key
                (generated automatically on first login). Only the two parties
                can decrypt the amount.
              </p>

              <SectionTitle>Gasless transactions</SectionTitle>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Every on-chain transaction goes through AVNU's paymaster. Users
                sign with their Privy wallet but never hold STRK for gas — the
                app sponsors all fees.
              </p>
            </section>

            <Divider />

            {/* Tech stack */}
            <section id="tech-stack" className="mb-12">
              <SectionLabel>Tech stack</SectionLabel>
              <SectionTitle>Built with</SectionTitle>
              <div className="mb-3">
                <p className="text-xs font-mono text-zinc-600 mb-2">Frontend</p>
                {[
                  "React 18",
                  "TypeScript",
                  "Vite",
                  "TailwindCSS",
                  "Privy React Auth",
                  "Starkzap SDK v2",
                  "React Router v6",
                  "Axios",
                ].map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <div className="mb-3">
                <p className="text-xs font-mono text-zinc-600 mb-2 mt-4">
                  Backend
                </p>
                {[
                  "Node.js 20",
                  "Express",
                  "TypeScript",
                  "Privy Server Auth",
                  "PostgreSQL",
                  "Nodemailer",
                  "Google Gemini",
                  "Starknet.js",
                  "Zod",
                ].map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <div>
                <p className="text-xs font-mono text-zinc-600 mb-2 mt-4">
                  Blockchain
                </p>
                {[
                  "Starknet Mainnet",
                  "Starkzap SDK v2",
                  "AVNU Paymaster",
                  "Tongo Protocol",
                ].map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </section>

            <Divider />

            {/* Integrations */}
            <section id="integrations" className="mb-12">
              <SectionLabel>Integrations</SectionLabel>
              <SectionTitle>Third-party services</SectionTitle>
              <Table
                headers={["Integration", "Purpose"]}
                rows={[
                  [
                    "Privy",
                    "Embedded wallets, email/Google auth, server-side signing",
                  ],
                  ["AVNU Paymaster", "Gasless transaction sponsorship"],
                  [
                    "Tongo (via Starkzap)",
                    "On-chain confidential/private transfers",
                  ],
                  ["Google Gemini", "Natural language AI command parsing"],
                  [
                    "Nodemailer",
                    "Transactional emails (claims, confirmations)",
                  ],
                  [
                    "PostgreSQL",
                    "User registry, transaction history, claim links",
                  ],
                  [
                    "Starknet RPC",
                    "On-chain reads (balances, staking positions)",
                  ],
                ]}
              />
            </section>

            <Divider />

            {/* Tokens */}
            <section id="tokens" className="mb-12">
              <SectionLabel>Tokens</SectionLabel>
              <SectionTitle>Supported assets</SectionTitle>
              <Table
                headers={["Token", "Type", "Network"]}
                rows={[
                  ["STRK", "Native Starknet token", "Mainnet"],
                  ["ETH", "Wrapped Ether", "Mainnet"],
                  ["BTC (cbBTC)", "Coinbase Wrapped BTC", "Mainnet"],
                  ["USDC", "USD Coin", "Mainnet"],
                  ["USDT", "Tether", "Mainnet"],
                ]}
              />
            </section>

            <Divider />

            {/* API */}
            <section id="api" className="mb-12">
              <SectionLabel>API reference</SectionLabel>
              <SectionTitle>Endpoints</SectionTitle>
              <div className="border border-surface-border rounded-xl overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-card">
                      {["Method", "Endpoint", "Description"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-[11px] font-mono text-zinc-600 uppercase tracking-widest border-b border-surface-border"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "POST",
                        "/api/user/register",
                        "Register or update user profile",
                      ],
                      ["GET", "/api/user/me", "Get authenticated user profile"],
                      ["PUT", "/api/user/username", "Set / change username"],
                      [
                        "GET",
                        "/api/user/lookup/:identifier",
                        "Look up by address, username, or email",
                      ],
                      [
                        "POST",
                        "/api/wallet/starknet",
                        "Create or fetch Privy Starknet wallet",
                      ],
                      [
                        "POST",
                        "/api/wallet/tongo",
                        "Get or generate Tongo private key",
                      ],
                      [
                        "POST",
                        "/api/transfer/prepare",
                        "Resolve recipient, determine escrow vs direct",
                      ],
                      [
                        "POST",
                        "/api/transfer/confirm",
                        "Record confirmed transfer, create claim links",
                      ],
                      [
                        "POST",
                        "/api/transfer/private/prepare",
                        "Resolve recipient for private transfer",
                      ],
                      [
                        "POST",
                        "/api/transfer/private/confirm",
                        "Record confirmed private transfer",
                      ],
                      [
                        "GET",
                        "/api/transfer/history",
                        "Transaction history for authenticated user",
                      ],
                      [
                        "POST",
                        "/api/claim/redeem",
                        "Redeem claim link and release escrow",
                      ],
                      ["GET", "/api/claim/:token", "Get claim link details"],
                      [
                        "GET",
                        "/api/staking/positions",
                        "Staking positions for wallet",
                      ],
                      [
                        "POST",
                        "/api/ai/parse",
                        "Parse natural language command with Gemini",
                      ],
                    ].map(([method, endpoint, desc], i, arr) => (
                      <tr
                        key={endpoint}
                        className={
                          i < arr.length - 1
                            ? "border-b border-surface-border"
                            : ""
                        }
                      >
                        <td className="px-4 py-2.5">
                          <MethodBadge method={method} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                          {endpoint}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-zinc-500">
                          {desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <Divider />

            {/* Running locally */}
            <section id="local" className="mb-12">
              <SectionLabel>Running locally</SectionLabel>
              <SectionTitle>Prerequisites</SectionTitle>
              <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                Node.js 20+, a PostgreSQL database, a{" "}
                <a
                  href="https://privy.io"
                  className="text-accent hover:underline"
                >
                  Privy
                </a>{" "}
                app, an{" "}
                <a
                  href="https://avnu.fi"
                  className="text-accent hover:underline"
                >
                  AVNU
                </a>{" "}
                API key, a{" "}
                <a
                  href="https://aistudio.google.com"
                  className="text-accent hover:underline"
                >
                  Google AI Studio
                </a>{" "}
                key, and SMTP credentials.
              </p>
              <SectionTitle>Steps</SectionTitle>
              <Step
                num="01"
                title="Clone & install"
                desc="git clone the repo, run npm install in both /backend and /frontend."
              />
              <Step
                num="02"
                title="Configure backend"
                desc="Copy .env.example → .env and fill in Privy, Starknet RPC, AVNU, Gemini, SMTP, and escrow wallet vars."
              />
              <Step
                num="03"
                title="Configure frontend"
                desc="Copy .env.example → .env with VITE_API_URL, VITE_PRIVY_APP_ID, VITE_STARKNET_NETWORK, VITE_AVNU_API_KEY."
              />
              <Step
                num="04"
                title="Run migrations"
                desc="cd backend && npm run migrate"
              />
              <Step
                num="05"
                title="Start servers"
                desc="npm run dev in /backend (port 3001) and /frontend (port 5173)."
              />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
