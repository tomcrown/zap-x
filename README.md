# Zap-X — Instant Token Transfers on Starknet

Zap-X is a non-custodial crypto transfer app built on Starknet. Send STRK to anyone — by wallet address, or email — with no gas fees, no seed phrases, and no crypto knowledge required. For recipients without a wallet, Zap-X creates one automatically and emails them a claim link.

Live at: [zapx.vercel.app](https://zapx.vercel.app)

---

## Features

| Feature              | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Send to anyone       | Send STRK to a wallet address, @username, or email address                                   |
| Private transfers    | On-chain confidential transfers — amount and recipient hidden using Tongo/ElGamal encryption |
| Auto-create wallets  | New recipients get a Privy-managed Starknet wallet created automatically                     |
| Claim links          | Unregistered recipients get an email with a claim link to collect funds                      |
| Gasless transactions | All transactions sponsored by AVNU Paymaster — zero gas cost for users                       |
| AI natural language  | Type "send 5 STRK to alice@example.com" and Gemini parses the intent                         |
| Staking              | Stake STRK into Starknet staking pools, view live yield and positions                        |
| Transaction history  | Full history of sent/received transfers with status tracking                                 |
| Email notifications  | Both sender and recipient get email confirmations on every transfer                          |

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
3. The recipient receives an email with a link: `zapx.vercel.app/claim/<token>`
4. They click the link, sign in with Privy (their email), and a wallet is auto-created
5. The backend releases escrow funds to their new wallet via a signed transfer

### Gasless Transactions

Every on-chain transaction is submitted through AVNU's paymaster. Users sign with their Privy wallet but never hold STRK for gas. The app sponsors all fees.

### AI Command Parsing

The send form includes a natural language input bar. Users can type things like:

- "Send 10 STRK to @tomcrown"
- "Transfer 0.5 STRK to alice@example.com with note birthday gift"

Google Gemini parses the intent and pre-fills the form fields automatically.

### Private Transfers (Tongo Confidential)

For maximum privacy, users can send confidential transfers where the amount and recipient address are hidden on-chain. This uses the Tongo protocol — ElGamal encryption with ZK proofs on Starknet:

1. Both sender and recipient must have a Tongo key (generated automatically on first login)
2. The sender's Tongo balance is funded from their public STRK balance
3. A confidential transfer is submitted — only the sender and recipient can decrypt the amount
4. The recipient can decrypt and withdraw their balance at any time

### Staking

Users can stake STRK directly into Starknet's native staking protocol. The dashboard shows live staking positions, accumulated yield, and allows starting / cancelling withdrawal intents.

---

## Tech Stack

### Frontend

- React 18 + TypeScript + Vite
- TailwindCSS (dark theme, custom design system)
- Privy React Auth (`@privy-io/react-auth`)
- Starkzap SDK v2 (Starknet transfers, staking, Tongo confidential)
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

Edit `backend/.env`:

```env
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/zapx

# Privy
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
PRIVY_WALLET_PUBLIC_KEY=your-privy-server-wallet-public-key
PRIVY_WALLET_PRIVATE_KEY=your-privy-server-wallet-private-key

# Starknet
STARKNET_NETWORK=mainnet
STARKNET_RPC_URL=https://starknet-mainnet.public.blastapi.io/rpc/v0_7

# Escrow wallet (funded with STRK for escrow releases)
ESCROW_WALLET_ADDRESS=0x...
ESCROW_PRIVATE_KEY=0x...

# AVNU Paymaster
AVNU_PAYMASTER_URL=https://paymaster.avnu.fi
AVNU_API_KEY=your-avnu-api-key

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=Zap-X <you@gmail.com>

# Frontend URL (for claim links in emails)
FRONTEND_URL=http://localhost:5173
```

### 3. Configure the frontend

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_STARKNET_NETWORK=mainnet
VITE_AVNU_API_KEY=your-avnu-api-key
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
