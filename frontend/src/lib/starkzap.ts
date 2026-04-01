/**
 * Starkzap SDK Integration
 *
 * Wraps the starkzap SDK for use in the Zap-X frontend.
 * All on-chain operations (transfer, stake, unstake) are executed here.
 * The user's Privy wallet is used as the signer via PrivySigner.
 *
 * SDK Docs: https://docs.starknet.io/build/starkzap/
 */

import { StarkZap, Amount, TxBuilder } from 'starkzap';
import { config as sdkConfig } from '../config.js';
import type { TokenSymbol } from '../types/index.js';

// ─── Token Address Map (used for token object lookup in SDK) ─────────────────

// The SDK exports token objects by symbol — import those at runtime
// and fall back to address-based lookup if needed.

let _sdk: StarkZap | null = null;

/**
 * Get (or create) the StarkZap SDK instance.
 * Pass the Privy wallet object (from usePrivy()) as the signer.
 */
export function getStarkZap(privyWallet?: unknown): StarkZap {
  if (_sdk) return _sdk;

  // PrivySigner wraps the Privy wallet for Starknet signing
  // See: https://docs.starknet.io/build/starkzap/signers#privy
  const signerConfig = privyWallet
    ? { signer: { type: 'privy' as const, wallet: privyWallet } }
    : {};

  _sdk = new StarkZap({
    network: (import.meta.env.VITE_STARKNET_NETWORK ?? 'sepolia') as 'mainnet' | 'sepolia',
    rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
    // AVNU Paymaster for gasless transactions
    paymaster: import.meta.env.VITE_AVNU_API_KEY
      ? {
          type: 'avnu',
          url: import.meta.env.VITE_AVNU_PAYMASTER_URL ?? 'https://sepolia.paymaster.avnu.fi',
          apiKey: import.meta.env.VITE_AVNU_API_KEY,
        }
      : undefined,
    ...signerConfig,
  });

  return _sdk;
}

/** Reset the SDK singleton (call when user disconnects) */
export function resetStarkZap(): void {
  _sdk = null;
}

// ─── Token Helper ─────────────────────────────────────────────────────────────

/**
 * Get the starkzap token object from a symbol string.
 * The SDK exports token constants: STRK, ETH, USDC, USDT, wBTC, etc.
 */
export async function getToken(symbol: TokenSymbol) {
  // Dynamic import of token constants from starkzap
  const tokens = await import('starkzap').then((m) => m);
  const token = (tokens as Record<string, unknown>)[symbol];
  if (!token) throw new Error(`Token ${symbol} is not supported by the Starkzap SDK.`);
  return token;
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export interface TransferParams {
  toAddress: string;
  amount: string;
  token: TokenSymbol;
  gasless?: boolean;
}

/**
 * Execute a token transfer using the Starkzap SDK.
 * Returns the transaction hash.
 */
export async function executeTransfer(params: TransferParams): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised. Connect wallet first.');

  const tokenObj = await getToken(params.token);
  const wallet = await sdk.getWallet();

  const parsedAmount = Amount.parse(params.amount, tokenObj as any);

  const result = await wallet.transfer(tokenObj as any, {
    to: params.toAddress,
    amount: parsedAmount,
    // Use sponsored (gasless) mode if AVNU paymaster configured
    ...(params.gasless && { feeMode: { mode: 'default' } }),
  });

  return result.transaction_hash;
}

// ─── Batch Transfer (multiple recipients) ────────────────────────────────────

export interface BatchTransferRecipient {
  to: string;
  amount: string;
}

export async function executeBatchTransfer(
  recipients: BatchTransferRecipient[],
  token: TokenSymbol,
  gasless?: boolean
): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const tokenObj = await getToken(token);
  const wallet = await sdk.getWallet();

  const amounts = recipients.map((r) => ({
    to: r.to,
    amount: Amount.parse(r.amount, tokenObj as any),
  }));

  const result = await wallet.transfer(
    tokenObj as any,
    amounts,
    gasless ? { feeMode: { mode: 'default' } } : undefined
  );

  return result.transaction_hash;
}

// ─── Staking ──────────────────────────────────────────────────────────────────

/**
 * Stake tokens into a pool.
 * Equivalent to wallet.stake(poolAddress, amount) in the SDK.
 * The SDK auto-detects whether to use enterPool or addToPool.
 */
export async function executeStake(
  poolAddress: string,
  amount: string,
  token: TokenSymbol,
  gasless?: boolean
): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const tokenObj = await getToken(token);
  const wallet = await sdk.getWallet();
  const parsedAmount = Amount.parse(amount, tokenObj as any);

  // wallet.stake() auto-detects new vs existing member
  const result = await wallet.stake(
    poolAddress,
    parsedAmount,
    gasless ? { feeMode: { mode: 'default' } } : undefined
  );

  return result.transaction_hash;
}

/**
 * Declare exit intent — first step of unstaking (starts cooldown).
 * Maps to wallet.exitPoolIntent(poolAddress, amount).
 */
export async function executeExitIntent(
  poolAddress: string,
  amount: string,
  token: TokenSymbol
): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const tokenObj = await getToken(token);
  const wallet = await sdk.getWallet();
  const parsedAmount = Amount.parse(amount, tokenObj as any);

  const result = await wallet.exitPoolIntent(poolAddress, parsedAmount);
  return result.transaction_hash;
}

/**
 * Complete the exit — second step, callable after cooldown window.
 * Maps to wallet.exitPool(poolAddress).
 */
export async function executeExit(poolAddress: string): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const wallet = await sdk.getWallet();
  const result = await wallet.exitPool(poolAddress);
  return result.transaction_hash;
}

// ─── Balance Query ────────────────────────────────────────────────────────────

export async function getBalance(token: TokenSymbol): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const tokenObj = await getToken(token);
  const wallet = await sdk.getWallet();

  const balance = await wallet.balanceOf(tokenObj as any);
  return balance.toUnit(); // human-readable string
}

export async function getAllBalances(): Promise<Record<TokenSymbol, string>> {
  const tokens: TokenSymbol[] = ['STRK', 'ETH', 'USDC', 'USDT', 'wBTC'];
  const results = await Promise.allSettled(tokens.map((t) => getBalance(t)));

  const out: Partial<Record<TokenSymbol, string>> = {};
  tokens.forEach((t, i) => {
    const r = results[i];
    out[t] = r.status === 'fulfilled' ? r.value : '0';
  });
  return out as Record<TokenSymbol, string>;
}

// ─── Pool Position ────────────────────────────────────────────────────────────

export interface PoolPosition {
  staked: string;
  rewards: string;
  total: string;
}

export async function getPoolPosition(poolAddress: string): Promise<PoolPosition | null> {
  const sdk = _sdk;
  if (!sdk) return null;

  const wallet = await sdk.getWallet();
  const isMember = await wallet.isPoolMember(poolAddress);
  if (!isMember) return null;

  const pos = await wallet.getPoolPosition(poolAddress);
  return {
    staked: pos.staked?.toUnit() ?? '0',
    rewards: pos.rewards?.toUnit() ?? '0',
    total: pos.total?.toUnit() ?? '0',
  };
}

// ─── Claim Staking Rewards ────────────────────────────────────────────────────

export async function claimPoolRewards(poolAddress: string): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const wallet = await sdk.getWallet();
  const result = await wallet.claimPoolRewards(poolAddress);
  return result.transaction_hash;
}

// ─── Batch Operations (TxBuilder) ────────────────────────────────────────────

/**
 * Execute a send + stake in a single batched transaction (one signature).
 * Uses TxBuilder from the Starkzap SDK.
 */
export async function executeSendAndStake(params: {
  toAddress: string;
  sendAmount: string;
  stakeAmount: string;
  token: TokenSymbol;
  poolAddress: string;
  gasless?: boolean;
}): Promise<string> {
  const sdk = _sdk;
  if (!sdk) throw new Error('Starkzap SDK not initialised.');

  const tokenObj = await getToken(params.token);
  const wallet = await sdk.getWallet();

  const tx = new TxBuilder(wallet);

  // Add transfer call
  tx.addTransfer(tokenObj as any, {
    to: params.toAddress,
    amount: Amount.parse(params.sendAmount, tokenObj as any),
  });

  // Add stake call
  tx.addStake(params.poolAddress, Amount.parse(params.stakeAmount, tokenObj as any));

  // Execute as single gasless transaction
  const result = await tx.execute(
    params.gasless ? { feeMode: { mode: 'default' } } : undefined
  );

  return result.transaction_hash;
}
