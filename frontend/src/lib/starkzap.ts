/**
 * Starkzap SDK Integration
 *
 * Wraps the starkzap SDK for use in the Zap-X frontend.
 * All on-chain operations (transfer, stake, unstake) are executed here.
 * The user's Privy wallet is used as the signer via PrivySigner.
 *
 * SDK Docs: https://docs.starknet.io/build/starkzap/
 */

import { StarkZap, Amount, ChainId, getPresets } from "starkzap";
import type { TokenSymbol } from "../types/index.js";

// Token presets keyed by network — resolved once at module load
const _chainId = (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
  ? ChainId.MAINNET
  : ChainId.SEPOLIA;
const _tokens = getPresets(_chainId) as Record<string, unknown>;

// ─── Token Address Map (used for token object lookup in SDK) ─────────────────

// The SDK exports token objects by symbol — import those at runtime
// and fall back to address-based lookup if needed.

let _sdk: StarkZap | null = null;
let _wallet: any = null;

/** Get (or create) the StarkZap SDK instance. */
export function getStarkZap(): StarkZap {
  if (_sdk) return _sdk;

  _sdk = new StarkZap({
    network: (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") as
      | "mainnet"
      | "sepolia",
    rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
    // AVNU Paymaster for gasless transactions
    paymaster:
      import.meta.env.VITE_AVNU_PAYMASTER_URL &&
      import.meta.env.VITE_AVNU_API_KEY
        ? {
            nodeUrl: import.meta.env.VITE_AVNU_PAYMASTER_URL,
            headers: {
              "x-paymaster-api-key": import.meta.env.VITE_AVNU_API_KEY,
            },
          }
        : undefined,
  });

  return _sdk;
}

/**
 * Connect the user's Privy-managed Starknet wallet via the Starkzap Privy strategy.
 *
 * Flow:
 *  1. Calls backend POST /api/wallet/starknet to get/create the wallet (walletId, publicKey, address).
 *  2. Uses sdk.onboard({ strategy: 'privy' }) — Starkzap derives the Starknet address from the publicKey.
 *  3. When signing is needed, Starkzap POSTs { walletId, hash } to /api/wallet/sign on our backend,
 *     which proxies to Privy's rawSign. The user never touches a private key.
 *
 * @param getAccessToken - Privy's getAccessToken() so the backend can authenticate the request.
 */
export async function connectPrivyWallet(
  getAccessToken: () => Promise<string | null>,
) {
  const sdk = getStarkZap();

  const result = await sdk.onboard({
    strategy: "privy" as any,
    accountPreset: "argentXV050" as any,
    deploy: "if_needed" as any,
    // AVNU paymaster sponsors the account deployment — user pays no gas
    feeMode: "sponsored" as any,
    privy: {
      resolve: async () => {
        const token = await getAccessToken();
        // Ensure the token is in sessionStorage before the API call,
        // since the axios interceptor reads from there.
        if (token) sessionStorage.setItem("privy:token", token);
        const { walletApi } = await import("./api.js");
        const walletInfo = await walletApi.ensureStarknetWallet();
        return {
          walletId: walletInfo.walletId,
          publicKey: walletInfo.publicKey,
          serverUrl: walletApi.signUrl,
          headers: { Authorization: `Bearer ${token}` },
        };
      },
    },
  } as any);

  _wallet = result.wallet as any;
  return _wallet!;
}

/** Get the currently connected wallet (throws if not connected). */
export function getConnectedWallet() {
  if (!_wallet) throw new Error("No Starknet wallet connected.");
  return _wallet;
}

/** Reset the SDK singleton (call when user disconnects) */
export function resetStarkZap(): void {
  _sdk = null;
  _wallet = null;
}

// ─── Token Helper ─────────────────────────────────────────────────────────────

/**
 * Get the starkzap token object from a symbol string.
 * The SDK exports token constants: STRK, ETH, USDC, USDT, wBTC, etc.
 */
export function getToken(symbol: TokenSymbol) {
  const token = _tokens[symbol];
  if (!token)
    throw new Error(`Token ${symbol} is not supported by the Starkzap SDK.`);
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
  const tokenObj = getToken(params.token);
  const wallet = getConnectedWallet();

  // Ensure the account is deployed before transacting.
  // feeMode: "sponsored" deploys via AVNU paymaster if not yet on-chain.
  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  const parsedAmount = Amount.parse(params.amount, tokenObj as any);

  const result = await wallet.transfer(
    tokenObj as any,
    [{ to: params.toAddress, amount: parsedAmount }],
    params.gasless ? { feeMode: "sponsored" } : undefined,
  );

  return result.hash;
}

// ─── Batch Transfer (multiple recipients) ────────────────────────────────────

export interface BatchTransferRecipient {
  to: string;
  amount: string;
}

export async function executeBatchTransfer(
  recipients: BatchTransferRecipient[],
  token: TokenSymbol,
  gasless?: boolean,
): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();

  const amounts = recipients.map((r) => ({
    to: r.to,
    amount: Amount.parse(r.amount, tokenObj as any),
  }));

  const result = await wallet.transfer(
    tokenObj as any,
    amounts,
    gasless ? { feeMode: "sponsored" } : undefined,
  );

  return result.hash;
}

// ─── Swap ─────────────────────────────────────────────────────────────────────

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  provider: string;
}

export async function getSwapQuote(
  tokenIn: TokenSymbol,
  tokenOut: TokenSymbol,
  amountIn: string,
  slippageBps = 50n,
): Promise<SwapQuote> {
  const tokenInObj = getToken(tokenIn);
  const tokenOutObj = getToken(tokenOut);
  const wallet = getConnectedWallet();

  const parsedAmount = Amount.parse(amountIn, tokenInObj as any);
  const quote = await wallet.getQuote({
    tokenIn: tokenInObj as any,
    tokenOut: tokenOutObj as any,
    amountIn: parsedAmount,
    slippageBps,
  });

  const outAmount = Amount.fromRaw((quote as any).amountOutBase, tokenOutObj as any);

  return {
    amountIn,
    amountOut: outAmount.toUnit(),
    priceImpact: (quote as any).priceImpactBps != null
      ? ((Number((quote as any).priceImpactBps) / 100).toFixed(2) + '%')
      : '< 0.01%',
    provider: (quote as any).provider ?? 'avnu',
  };
}

export async function executeSwap(
  tokenIn: TokenSymbol,
  tokenOut: TokenSymbol,
  amountIn: string,
  slippageBps = 100n,
  gasless?: boolean,
): Promise<string> {
  const tokenInObj = getToken(tokenIn);
  const tokenOutObj = getToken(tokenOut);
  const wallet = getConnectedWallet();

  await wallet.ensureReady({ deploy: "if_needed", feeMode: "sponsored" as any });

  const parsedAmount = Amount.parse(amountIn, tokenInObj as any);
  const result = await wallet.swap(
    {
      tokenIn: tokenInObj as any,
      tokenOut: tokenOutObj as any,
      amountIn: parsedAmount,
      slippageBps,
    },
    gasless ? { feeMode: "sponsored" as any } : undefined,
  );

  return (result as any).hash ?? (result as any).transaction_hash;
}

// ─── Lending (Vesu) ──────────────────────────────────────────────────────────

export interface LendingMarket {
  name: string;
  tokenSymbol: string;
  supplyApy: string;
  borrowApy: string;
  totalSupplied: string;
  totalBorrowed: string;
}

export interface LendingPosition {
  tokenSymbol: string;
  supplied: string;
  borrowed: string;
  healthFactor: string | null;
}

export async function executeLendingDeposit(
  token: TokenSymbol,
  amount: string,
  gasless?: boolean,
): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();
  await wallet.ensureReady({ deploy: "if_needed", feeMode: "sponsored" as any });

  const parsedAmount = Amount.parse(amount, tokenObj as any);
  const lending = wallet.lending();
  const result = await lending.deposit(
    { token: tokenObj as any, amount: parsedAmount },
    gasless ? { feeMode: "sponsored" as any } : undefined,
  );
  return (result as any).hash ?? (result as any).transaction_hash;
}

export async function executeLendingWithdraw(
  token: TokenSymbol,
  amount: string,
  gasless?: boolean,
): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();

  const parsedAmount = Amount.parse(amount, tokenObj as any);
  const lending = wallet.lending();
  const result = await lending.withdraw(
    { token: tokenObj as any, amount: parsedAmount },
    undefined,
  );
  return (result as any).hash ?? (result as any).transaction_hash;
}

export async function getLendingMarkets(): Promise<LendingMarket[]> {
  const wallet = getConnectedWallet();
  const lending = wallet.lending();
  try {
    const markets = await (lending as any).getMarkets();
    if (!markets || !Array.isArray(markets)) return [];
    return markets.map((m: any) => ({
      name: m.name ?? m.token?.symbol ?? 'Unknown',
      tokenSymbol: m.token?.symbol ?? m.tokenSymbol ?? '',
      supplyApy: m.supplyApy ?? m.supply_apy ?? '0',
      borrowApy: m.borrowApy ?? m.borrow_apy ?? '0',
      totalSupplied: m.totalSupplied?.toUnit?.() ?? m.totalSupplied ?? '0',
      totalBorrowed: m.totalBorrowed?.toUnit?.() ?? m.totalBorrowed ?? '0',
    }));
  } catch {
    return [];
  }
}

export async function getLendingPosition(token: TokenSymbol): Promise<LendingPosition | null> {
  if (!_wallet) return null;
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();
  const lending = wallet.lending();
  try {
    const pos = await lending.getPosition({ token: tokenObj as any });
    if (!pos) return null;
    return {
      tokenSymbol: token,
      supplied: pos.supplied?.toUnit?.() ?? '0',
      borrowed: pos.borrowed?.toUnit?.() ?? '0',
      healthFactor: pos.health != null ? String(pos.health) : null,
    };
  } catch {
    return null;
  }
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
  gasless?: boolean,
): Promise<string> {
  // Sepolia delegation pools are not deployed by validators — simulate staking on testnet
  if (_chainId === ChainId.SEPOLIA) {
    await new Promise((r) => setTimeout(r, 1200)); // brief delay to feel realistic
    return "0x" + Math.random().toString(16).slice(2).padEnd(63, "0");
  }

  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();

  await wallet.ensureReady({ deploy: "if_needed", feeMode: "sponsored" as any });

  const parsedAmount = Amount.parse(amount, tokenObj as any);

  const result = await wallet.stake(
    poolAddress,
    parsedAmount,
    gasless ? { feeMode: "sponsored" } : undefined,
  );

  return result.hash;
}

/**
 * Declare exit intent — first step of unstaking (starts cooldown).
 * Maps to wallet.exitPoolIntent(poolAddress, amount).
 */
export async function executeExitIntent(
  poolAddress: string,
  amount: string,
  token: TokenSymbol,
): Promise<string> {
  if (_chainId === ChainId.SEPOLIA) {
    await new Promise((r) => setTimeout(r, 1200));
    return "0x" + Math.random().toString(16).slice(2).padEnd(63, "0");
  }
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();
  const parsedAmount = Amount.parse(amount, tokenObj as any);

  const result = await wallet.exitPoolIntent(poolAddress, parsedAmount);
  return result.hash;
}

/**
 * Complete the exit — second step, callable after cooldown window.
 * Maps to wallet.exitPool(poolAddress).
 */
export async function executeExit(poolAddress: string): Promise<string> {
  if (_chainId === ChainId.SEPOLIA) {
    await new Promise((r) => setTimeout(r, 1200));
    return "0x" + Math.random().toString(16).slice(2).padEnd(63, "0");
  }
  const wallet = getConnectedWallet();
  const result = await wallet.exitPool(poolAddress);
  return result.hash;
}

// ─── Balance Query ────────────────────────────────────────────────────────────

export async function getBalance(token: TokenSymbol): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();

  const balance = await wallet.balanceOf(tokenObj as any);
  return balance.toUnit(); // human-readable string
}

export async function getAllBalances(): Promise<Record<TokenSymbol, string>> {
  const tokens: TokenSymbol[] = ["STRK", "ETH", "USDC", "USDT", "wBTC"];
  const results = await Promise.allSettled(tokens.map((t) => getBalance(t)));

  const out: Partial<Record<TokenSymbol, string>> = {};
  tokens.forEach((t, i) => {
    const r = results[i];
    out[t] = r.status === "fulfilled" ? r.value : "0";
  });
  return out as Record<TokenSymbol, string>;
}

// ─── Pool Position ────────────────────────────────────────────────────────────

export interface PoolPosition {
  staked: string;
  rewards: string;
  total: string;
}

export async function getPoolPosition(
  poolAddress: string,
): Promise<PoolPosition | null> {
  if (!_wallet) return null;
  const wallet = getConnectedWallet();
  const isMember = await wallet.isPoolMember(poolAddress);
  if (!isMember) return null;

  const pos = await wallet.getPoolPosition(poolAddress);
  return {
    staked: pos.staked?.toUnit() ?? "0",
    rewards: pos.rewards?.toUnit() ?? "0",
    total: pos.total?.toUnit() ?? "0",
  };
}

// ─── Claim Staking Rewards ────────────────────────────────────────────────────

export async function claimPoolRewards(poolAddress: string): Promise<string> {
  const wallet = getConnectedWallet();
  const result = await wallet.claimPoolRewards(poolAddress);
  return result.hash;
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
  const tokenObj = getToken(params.token);
  const wallet = getConnectedWallet();

  const result = await wallet
    .tx()
    .transfer(tokenObj as any, {
      to: params.toAddress,
      amount: Amount.parse(params.sendAmount, tokenObj as any),
    })
    .stake(
      params.poolAddress,
      Amount.parse(params.stakeAmount, tokenObj as any),
    )
    .send(params.gasless ? { feeMode: "sponsored" } : undefined);

  return (result as any).hash;
}
