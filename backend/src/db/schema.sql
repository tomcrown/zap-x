-- Zap-X PostgreSQL Schema for Supabase
-- Run this in your Supabase project's SQL Editor (once)

CREATE TABLE IF NOT EXISTS users (
  id                      SERIAL PRIMARY KEY,
  username                TEXT UNIQUE,
  email                   TEXT UNIQUE,
  wallet_address          TEXT UNIQUE,
  privy_user_id           TEXT UNIQUE,
  privy_wallet_id         TEXT,
  privy_wallet_public_key TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_links (
  id                  SERIAL PRIMARY KEY,
  token               TEXT NOT NULL UNIQUE,
  sender_wallet       TEXT NOT NULL,
  recipient_email     TEXT,
  recipient_username  TEXT,
  amount              TEXT NOT NULL,
  token_type          TEXT NOT NULL,
  escrow_tx_hash      TEXT,
  claim_tx_hash       TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   SERIAL PRIMARY KEY,
  sender_wallet        TEXT NOT NULL,
  recipient_wallet     TEXT,
  recipient_identifier TEXT NOT NULL,
  amount               TEXT NOT NULL,
  token                TEXT NOT NULL,
  tx_hash              TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  note                 TEXT,
  claim_link_id        INTEGER REFERENCES claim_links(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staking_positions (
  id                   SERIAL PRIMARY KEY,
  user_wallet          TEXT NOT NULL,
  pool_address         TEXT NOT NULL,
  pool_name            TEXT NOT NULL DEFAULT 'STRK Staking Pool',
  token                TEXT NOT NULL,
  staked_amount        TEXT NOT NULL,
  entry_tx_hash        TEXT,
  exit_intent_tx_hash  TEXT,
  status               TEXT NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lending_positions (
  id               SERIAL PRIMARY KEY,
  user_wallet      TEXT NOT NULL,
  token            TEXT NOT NULL,
  supplied_amount  TEXT NOT NULL,
  entry_tx_hash    TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS swaps (
  id          SERIAL PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  token_in    TEXT NOT NULL,
  token_out   TEXT NOT NULL,
  amount_in   TEXT NOT NULL,
  amount_out  TEXT NOT NULL,
  tx_hash     TEXT NOT NULL,
  provider    TEXT NOT NULL DEFAULT 'avnu',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dca_records (
  id                SERIAL PRIMARY KEY,
  user_wallet       TEXT NOT NULL,
  sell_token        TEXT NOT NULL,
  buy_token         TEXT NOT NULL,
  amount_per_cycle  TEXT NOT NULL,
  frequency         TEXT NOT NULL,
  order_address     TEXT,
  tx_hash           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bridge_records (
  id          SERIAL PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  token       TEXT NOT NULL,
  amount      TEXT NOT NULL,
  from_chain  TEXT NOT NULL DEFAULT 'ethereum',
  tx_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Migrations (run after initial schema creation) ───────────────────────────

-- Tongo confidential transfer keys (Phase 1: private transfers)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tongo_private_key   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tongo_public_key_x  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tongo_public_key_y  TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_sender     ON transactions(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_recipient  ON transactions(recipient_wallet);
CREATE INDEX IF NOT EXISTS idx_claim_links_token       ON claim_links(token);
CREATE INDEX IF NOT EXISTS idx_claim_links_email       ON claim_links(recipient_email);
CREATE INDEX IF NOT EXISTS idx_swaps_wallet            ON swaps(user_wallet);
CREATE INDEX IF NOT EXISTS idx_lending_wallet          ON lending_positions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_staking_wallet          ON staking_positions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_users_username          ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email             ON users(email);
CREATE INDEX IF NOT EXISTS idx_dca_wallet              ON dca_records(user_wallet);
CREATE INDEX IF NOT EXISTS idx_bridge_wallet           ON bridge_records(user_wallet);
