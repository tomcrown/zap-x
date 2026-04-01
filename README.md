# ⚡ Zap-X — Instant STRK & Bitcoin Transfers on Starknet

> Hackathon project: gasless token transfers, AI command parsing, claim links for new users, and staking yield — all in one app.

## ✨ Features

| Feature | Stack |
|---|---|
| Send STRK / BTC to @username, email, or address | Starkzap SDK v2 |
| Auto-create wallets for new recipients | Privy Embedded Wallets |
| Gasless transactions | AVNU Paymaster |
| Claim links with email notifications | Nodemailer + Escrow |
| AI natural language commands | Google Gemini |
| Staking / yield dashboard | Starknet Staking Protocol |
| Full dashboard with history | React + TailwindCSS |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Zap-X Frontend (React)                     │
│  Privy Auth → Starkzap SDK → On-chain Tx                     │
│  Dashboard | Send | Stake | Claim pages                      │
└─────────────────────┬──────────────────────┬────────────────┘
                      │ REST API              │
┌─────────────────────▼──────────────────────▼────────────────┐
│                   Zap-X Backend (Express)                     │
│  User Registry | Claim Links | Email | AI Parser             │
│  SQLite DB (better-sqlite3)                                  │
└──────────────────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
    Starknet      AVNU Paymaster   Gemini AI
    (Sepolia)     (gasless tx)     (NL parsing)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Privy account: https://dashboard.privy.io
- AVNU API key: https://portal.avnu.fi
- Gemini API key: https://makersuite.google.com/app/apikey
- SMTP credentials (Gmail App Password or Resend)

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with your API keys
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Fill in .env with your API keys
npm run dev
```

### 3. Open in Browser

```
http://localhost:5173
```

## 🔑 Environment Variables

### Backend (`backend/.env`)

```env
PORT=3001
JWT_SECRET=your-secret
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
STARKNET_NETWORK=sepolia
STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_7
ESCROW_WALLET_ADDRESS=0x...   # Funded with STRK for escrow releases
ESCROW_PRIVATE_KEY=0x...
AVNU_PAYMASTER_URL=https://sepolia.paymaster.avnu.fi
AVNU_API_KEY=your-avnu-key
GEMINI_API_KEY=your-gemini-key
SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```

### Frontend (`frontend/.env`)

```env
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_STARKNET_NETWORK=sepolia
VITE_AVNU_API_KEY=your-avnu-key
```

## 💡 How It Works

### Send to Email (Escrow Flow)
1. Alice enters `bob@example.com` as recipient
2. Frontend calls `/api/transfer/prepare` → gets escrow address
3. Frontend signs and submits transfer to escrow wallet (via Starkzap SDK)
4. Frontend calls `/api/transfer/confirm` → backend creates claim link
5. Bob receives an email with a claim link
6. Bob clicks link → authenticates with Privy → new wallet created automatically
7. Bob clicks "Claim" → backend releases escrow to Bob's new wallet

### AI Commands
1. User types: `"Send 5 STRK to @alice and stake 10 STRK"`
2. Frontend sends to `/api/ai/parse`
3. Gemini extracts: `[{type:'send', amount:'5', token:'STRK', recipient:'@alice'}, {type:'stake', amount:'10', token:'STRK'}]`
4. Frontend pre-fills the send form

### Gasless Transactions
- All on-chain calls go through AVNU Paymaster
- User signs with Privy wallet — no ETH/STRK needed for gas
- The app (or AVNU) sponsors the gas fees

## 📦 Tech Stack

**Frontend**
- React 18 + TypeScript + Vite
- TailwindCSS (dark theme, custom design system)
- Privy React Auth (`@privy-io/react-auth`)
- Starkzap SDK v2 (`starkzap`)
- TanStack Query for data fetching
- React Router v6

**Backend**
- Node.js 20 + Express + TypeScript
- Privy Server Auth (`@privy-io/server-auth`)
- Google Gemini (`@google/generative-ai`)
- Nodemailer for email
- better-sqlite3 for local DB
- Starknet.js for escrow wallet signing
- Zod for request validation

**Blockchain**
- Starknet (Sepolia testnet / Mainnet)
- Starkzap SDK v2 (transfers, staking, batching)
- AVNU Paymaster (gasless transactions)
- Privy Embedded Wallets (auto-creation for new users)

## 📁 Project Structure

```
zap-x/
├── backend/
│   └── src/
│       ├── config/       # Environment config
│       ├── db/           # SQLite setup + schema
│       ├── middleware/   # Auth, validation, errors
│       ├── models/       # TypeScript types
│       ├── routes/       # API routes
│       ├── services/     # Business logic
│       └── utils/        # Helpers, crypto
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── claim/    # Claim page
│       │   ├── common/   # Shared UI
│       │   ├── dashboard/# Dashboard panels
│       │   ├── layout/   # Navbar, sidebar
│       │   └── send/     # Send form + AI bar
│       ├── contexts/     # React context providers
│       ├── hooks/        # Custom hooks
│       ├── lib/          # API client, Starkzap wrapper
│       ├── pages/        # Route-level pages
│       └── types/        # TypeScript types
└── README.md
```

## 🔗 Key Starkzap SDK Calls

```typescript
// Transfer (gasless)
await wallet.transfer(STRK, { to: address, amount: Amount.parse('5', STRK) });

// Stake
await wallet.stake(poolAddress, Amount.parse('10', STRK));

// Exit intent (start cooldown)
await wallet.exitPoolIntent(poolAddress, Amount.parse('10', STRK));

// Batch: send + stake in one tx
const tx = new TxBuilder(wallet);
tx.addTransfer(STRK, { to: address, amount: Amount.parse('5', STRK) });
tx.addStake(poolAddress, Amount.parse('10', STRK));
await tx.execute({ feeMode: { mode: 'default' } }); // single gasless tx
```

## 🌐 Demo Pages

| Route | Description |
|---|---|
| `/` | Landing / Login |
| `/dashboard` | Portfolio overview |
| `/send` | Send STRK/Bitcoin + AI bar |
| `/stake` | Staking positions + yield |
| `/claim/:token` | Public claim page (no login required) |

---

Built for hackathon · Starknet Ecosystem · April 2026
