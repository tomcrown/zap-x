# Zap-X — AI-Powered DeFi on Starknet

Zap-X is a non-custodial DeFi app built on Starknet, controlled entirely through an AI chat interface. Type what you want — send, swap, stake, or DCA — and it happens on-chain. No menus, no forms, no crypto knowledge required.

Send STRK to anyone by wallet address or email. For recipients without a wallet, Zap-X creates one automatically and emails them a claim link. They click it, sign in, and they're in — no setup, no seed phrases.

Live at: [zap-x-five.vercel.app](https://zap-x-five.vercel.app)

---
## Features

| Feature              | Description                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| AI chat interface    | Every action — send, swap, stake, DCA — is executed through a natural language chat UI          |
| Send to anyone       | Send tokens to a wallet address, @username, or email address                                    |
| Auto-create wallets  | New recipients get a Privy-managed Starknet wallet created automatically                        |
| Claim links          | Unregistered recipients get an email with a claim link to collect funds                         |
| Gasless transactions | All transactions sponsored by AVNU Paymaster — zero gas cost for users                          |
| Private transfers    | On-chain confidential transfers — amount and recipient hidden using Tongo / ElGamal + ZK proofs |
| Swap                 | Swap between supported tokens instantly                                                         |
| DCA                  | Automate recurring token buys on a schedule                                                     |
| Staking              | Stake STRK into Starknet native staking pools, view live yield and positions                    |
| Transaction history  | Full history of sent/received transfers with status tracking                                    |
| Email notifications  | Both sender and recipient get email confirmations on every transfer                             |

---

## How It Works

### Authentication

Users sign in with email or Google via Privy. No wallet setup required — Privy creates a Starknet wallet server-side and the app derives the address. The private key never leaves Privy's infrastructure.

### Sending Tokens

1. User enters an amount, token, and recipient (address / @username / email)
2. The frontend calls `/api/transfer/prepare` to resolve the recipient
3. If the recipient has a wallet, the transfer goes directly on-chain via the Starkzap SDK
4. If the recipient has no wallet, a claim link is emailed to them

### Claim Links

When a recipient doesn't have a Zap-X account:

1. Funds are sent to the escrow wallet
2. A unique claim token is generated and stored in the database
3. The recipient receives an email with a link: `zap-x-five.vercel.app/claim/<token>`
4. They click the link, sign in with Privy (their email), and a wallet is auto-created
5. The backend releases escrow funds to their new wallet via a signed transfer

### Gasless Transactions

Every on-chain transaction is submitted through AVNU's paymaster. Users sign with their Privy wallet but never hold STRK for gas. The app sponsors all fees.

### AI Chat Interface

Zap-X has no forms and no navigation menus. Every action happens through a single chat interface powered by Google Gemini. Users type what they want, the AI parses the intent and prepares the transaction, and the user confirms.

Examples:

- "Send 10 STRK to @tomcrown"
- "Transfer 0.5 STRK to alice@example.com"
- "Swap USDC to STRK"
- "DCA 5 STRK daily"
- "Stake 20 STRK"

Gemini parses the intent and pre-fills all transaction parameters automatically.

### Private Transfers (Tongo Confidential)

For maximum privacy, users can send confidential transfers where the amount and recipient address are hidden on-chain. This uses the Tongo protocol — ElGamal encryption with ZK proofs on Starknet:

1. Both sender and recipient must have a Tongo key (generated automatically on first login)
2. The sender's Tongo balance is funded from their public STRK balance
3. A confidential transfer is submitted — only the sender and recipient can decrypt the amount
4. The recipient can decrypt and withdraw their balance at any time

### Swap

Users can swap between supported tokens instantly through the chat interface. Type "swap X to Y" and the AI prepares the transaction via the Starkzap SDK.

### DCA (Dollar Cost Averaging)

Users can automate recurring token buys on a schedule. Type "DCA 5 STRK daily" and Zap-X sets up automated purchases at the specified interval.

### Staking

Users can stake STRK directly into Starknet's native staking protocol. The dashboard shows live staking positions, accumulated yield, and allows starting / cancelling withdrawal intents.

---

## Tech Stack

### Frontend

- React 18 + TypeScript + Vite
- TailwindCSS (dark theme, custom design system)
- Privy React Auth (`@privy-io/react-auth`)
- Starkzap SDK v2 — token transfers, swaps, DCA, lending, batched transactions, Tongo confidential
- React Router v6
- Axios for API calls

### Backend

- Node.js 20 + Express + TypeScript
- Privy Server Auth (`@privy-io/server-auth`) — user lookup, JWT verification
- Privy Node SDK (`@privy-io/node`) — wallet creation, server-side signing
- PostgreSQL via `postgres` (node-postgres tagged templates)
- Nodemailer — claim emails and transfer notifications
- Google Gemini (`@google/generative-ai`) — AI command parsing
- Starknet.js — escrow wallet signing and address utilities
- Zod — request validation

### Blockchain

- Starknet Mainnet
- Starkzap SDK v2 — token transfers, staking, batched transactions, Tongo confidential
- AVNU Paymaster — gasless sponsored transactions
- Tongo Protocol — on-chain confidential transfers (ElGamal + ZK proofs)

---

## Integrations

| Integration          | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| Privy                | Embedded wallets, email/Google auth, server-side signing |
| AVNU Paymaster       | Gasless transaction sponsorship                          |
| Tongo (via Starkzap) | On-chain confidential/private transfers                  |
| Google Gemini        | Natural language AI command parsing                      |
| Nodemailer           | Transactional emails (claims, transfer confirmations)    |
| PostgreSQL           | User registry, transaction history, claim links          |
| Starknet RPC         | On-chain reads (balances, staking positions)             |

---

## Supported Tokens

| Token       | Type                  | Network |
| ----------- | --------------------- | ------- |
| STRK        | Native Starknet token | Mainnet |
| ETH         | Wrapped Ether         | Mainnet |
| BTC (cbBTC) | Coinbase Wrapped BTC  | Mainnet |
| USDC        | USD Coin              | Mainnet |
| USDT        | Tether                | Mainnet |

---

## Project Structure

```
zap-x/
├── backend/
│   └── src/
│       ├── config/         # Environment config loader
│       ├── db/             # PostgreSQL setup + schema migrations
│       ├── middleware/     # Auth (Privy JWT), error handler
│       ├── models/         # TypeScript types and interfaces
│       ├── routes/         # Express API routes
│       │   ├── ai.ts       # POST /api/ai/parse
│       │   ├── claim.ts    # Claim link creation and redemption
│       │   ├── staking.ts  # Staking position queries
│       │   ├── transfer.ts # Send prepare/confirm + private transfers
│       │   ├── user.ts     # Profile, registration, username
│       │   └── wallet.ts   # Starknet wallet + Tongo key management
│       ├── services/
│       │   ├── aiService.ts       # Gemini integration
│       │   ├── claimService.ts    # Claim link lifecycle
│       │   ├── emailService.ts    # Nodemailer templates
│       │   ├── stakingService.ts  # Staking queries
│       │   ├── transferService.ts # Transfer resolution + recording
│       │   └── walletService.ts   # Privy wallet + Tongo key management
│       └── utils/
│           ├── crypto.ts   # Address validation, recipient type detection
│           └── helpers.ts  # Username normalisation
└── frontend/
    └── src/
        ├── components/
        │   ├── claim/      # Claim page flow
        │   ├── common/     # Shared UI (buttons, inputs, modals)
        │   ├── dashboard/  # Portfolio, balance, history panels
        │   ├── layout/     # Navbar, sidebar
        │   └── send/       # Send form + AI bar + private toggle
        ├── contexts/
        │   └── WalletContext.tsx  # Auth state, wallet address, balances
        ├── hooks/          # Custom React hooks
        ├── lib/
        │   ├── api.ts      # Typed API client (axios)
        │   └── starkzap.ts # Starkzap SDK wrapper (transfers, staking, Tongo)
        ├── pages/          # Route-level page components
        └── types/          # Shared TypeScript types
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or hosted, e.g. Supabase / Neon)
- [Privy](https://privy.io) app — for embedded wallets and auth
- [AVNU](https://avnu.fi) API key — for gasless transactions
- [Google AI Studio](https://aistudio.google.com) API key — for AI parsing
- SMTP credentials — Gmail App Password or a transactional email provider

### 1. Clone and install

```bash
git clone https://github.com/your-org/zap-x.git
cd zap-x

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

### 3. Configure the frontend

```bash
cd frontend
cp .env.example .env
```

### 4. Run database migrations

```bash
cd backend
npm run migrate
```

### 5. Start the servers

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## API Reference

| Method | Endpoint                        | Description                                      |
| ------ | ------------------------------- | ------------------------------------------------ |
| POST   | `/api/user/register`            | Register or update user profile                  |
| GET    | `/api/user/me`                  | Get authenticated user profile                   |
| PUT    | `/api/user/username`            | Set / change username                            |
| GET    | `/api/user/lookup/:identifier`  | Look up user by address, username, or email      |
| POST   | `/api/wallet/starknet`          | Create or fetch Privy Starknet wallet            |
| POST   | `/api/wallet/sign`              | Proxy Privy rawSign for transaction hashes       |
| POST   | `/api/wallet/tongo`             | Get or generate Tongo private key                |
| POST   | `/api/wallet/tongo/pubkey`      | Save Tongo public key coordinates                |
| POST   | `/api/transfer/prepare`         | Resolve recipient and determine escrow vs direct |
| POST   | `/api/transfer/confirm`         | Record confirmed transfer, create claim links    |
| POST   | `/api/transfer/private/prepare` | Resolve recipient for a private Tongo transfer   |
| POST   | `/api/transfer/private/confirm` | Record confirmed private transfer                |
| GET    | `/api/transfer/history`         | Get transaction history for authenticated user   |
| POST   | `/api/claim/redeem`             | Redeem a claim link and release escrow           |
| GET    | `/api/claim/:token`             | Get claim link details                           |
| GET    | `/api/staking/positions`        | Get staking positions for wallet                 |
| POST   | `/api/ai/parse`                 | Parse natural language command with Gemini       |

---

Built on Starknet · April 2026
