import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.resolve(config.db.path);
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT UNIQUE,
      email          TEXT UNIQUE,
      wallet_address TEXT NOT NULL UNIQUE,
      privy_user_id  TEXT UNIQUE,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_wallet        TEXT NOT NULL,
      recipient_wallet     TEXT,
      recipient_identifier TEXT NOT NULL,
      amount               TEXT NOT NULL,
      token                TEXT NOT NULL,
      tx_hash              TEXT,
      status               TEXT NOT NULL DEFAULT 'pending',
      note                 TEXT,
      claim_link_id        INTEGER REFERENCES claim_links(id),
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS claim_links (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      token               TEXT NOT NULL UNIQUE,
      sender_wallet       TEXT NOT NULL,
      recipient_email     TEXT,
      recipient_username  TEXT,
      amount              TEXT NOT NULL,
      token_type          TEXT NOT NULL,
      escrow_tx_hash      TEXT,
      claim_tx_hash       TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      expires_at          TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staking_positions (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_wallet          TEXT NOT NULL,
      pool_address         TEXT NOT NULL,
      pool_name            TEXT NOT NULL DEFAULT 'STRK Staking Pool',
      token                TEXT NOT NULL,
      staked_amount        TEXT NOT NULL,
      entry_tx_hash        TEXT,
      exit_intent_tx_hash  TEXT,
      status               TEXT NOT NULL DEFAULT 'active',
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_sender ON transactions(sender_wallet);
    CREATE INDEX IF NOT EXISTS idx_transactions_recipient ON transactions(recipient_wallet);
    CREATE INDEX IF NOT EXISTS idx_claim_links_token ON claim_links(token);
    CREATE INDEX IF NOT EXISTS idx_claim_links_email ON claim_links(recipient_email);
    CREATE TABLE IF NOT EXISTS lending_positions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_wallet      TEXT NOT NULL,
      token            TEXT NOT NULL,
      supplied_amount  TEXT NOT NULL,
      entry_tx_hash    TEXT,
      status           TEXT NOT NULL DEFAULT 'active',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS swaps (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_wallet TEXT NOT NULL,
      token_in    TEXT NOT NULL,
      token_out   TEXT NOT NULL,
      amount_in   TEXT NOT NULL,
      amount_out  TEXT NOT NULL,
      tx_hash     TEXT NOT NULL,
      provider    TEXT NOT NULL DEFAULT 'avnu',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_swaps_wallet ON swaps(user_wallet);
    CREATE INDEX IF NOT EXISTS idx_lending_wallet ON lending_positions(user_wallet);
    CREATE INDEX IF NOT EXISTS idx_staking_wallet ON staking_positions(user_wallet);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS dca_records (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_wallet       TEXT NOT NULL,
      sell_token        TEXT NOT NULL,
      buy_token         TEXT NOT NULL,
      amount_per_cycle  TEXT NOT NULL,
      frequency         TEXT NOT NULL,
      order_address     TEXT,
      tx_hash           TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bridge_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_wallet TEXT NOT NULL,
      token       TEXT NOT NULL,
      amount      TEXT NOT NULL,
      from_chain  TEXT NOT NULL DEFAULT 'ethereum',
      tx_hash     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_dca_wallet ON dca_records(user_wallet);
    CREATE INDEX IF NOT EXISTS idx_bridge_wallet ON bridge_records(user_wallet);
  `);

  // Migrations: add columns that may not exist in older DBs
  for (const sql of [
    `ALTER TABLE users ADD COLUMN privy_wallet_id TEXT`,
    `ALTER TABLE users ADD COLUMN privy_wallet_public_key TEXT`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Migrate wallet_address from NOT NULL to nullable so we can insert a user row
  // before the wallet address is known (privy_user_id is now the primary lookup key).
  // SQLite doesn't support ALTER COLUMN, so we recreate the table if needed.
  const col = (db.prepare(`PRAGMA table_info(users)`).all() as any[])
    .find((c) => c.name === 'wallet_address');
  if (col?.notnull === 1) {
    db.exec(`
      CREATE TABLE users_new (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        username                TEXT UNIQUE,
        email                   TEXT UNIQUE,
        wallet_address          TEXT UNIQUE,
        privy_user_id           TEXT UNIQUE,
        privy_wallet_id         TEXT,
        privy_wallet_public_key TEXT,
        created_at              TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new SELECT id, username, email, wallet_address, privy_user_id, privy_wallet_id, privy_wallet_public_key, created_at, updated_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  }
}

export default getDb;
