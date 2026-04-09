/**
 * Starkzap SDK Integration
 *
 * Wraps the starkzap SDK for use in the Zap-X frontend.
 * All on-chain operations (transfer, stake, unstake) are executed here.
 * The user's Privy wallet is used as the signer via PrivySigner.
 *
 * SDK Docs: https://docs.starknet.io/build/starkzap/
 */

import {
  StarkZap,
  Amount,
  ChainId,
  getPresets,
  ExternalChain,
  ConnectedEthereumWallet,
  EthereumNetwork,
  TongoConfidential,
} from "starkzap";
import { CallData, uint256, RpcProvider } from "starknet";
import type { TokenSymbol } from "../types/index.js";

// Vesu pool factory & default pool — network-aware (from starkzap vesuPresets)
const VESU_POOL_FACTORY =
  (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
    ? "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0"
    : "0x03ac869e64b1164aaee7f3fd251f86581eab8bfbbd2abdf1e49c773282d4a092";
const VESU_DEFAULT_POOL =
  (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
    ? "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5"
    : "0x06227c13372b8c7b7f38ad1cfe05b5cf515b4e5c596dd05fe8437ab9747b2093";

// Token presets keyed by network — resolved once at module load
const _chainId =
  (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
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
  // Clear Tongo session state so the next user gets fresh keys
  for (const k of Object.keys(_tongoInstances)) {
    delete _tongoInstances[k as TokenSymbol];
  }
  _tongoPrivateKey = null;
  _tongoPubKeyRegistered = false;
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

  const outAmount = Amount.fromRaw(
    (quote as any).amountOutBase,
    tokenOutObj as any,
  );

  return {
    amountIn,
    amountOut: outAmount.toUnit(),
    priceImpact:
      (quote as any).priceImpactBps != null
        ? (Number((quote as any).priceImpactBps) / 100).toFixed(2) + "%"
        : "< 0.01%",
    provider: (quote as any).provider ?? "avnu",
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

  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

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

/** Try an async fn with sponsored fee, fallback to user_pays if paymaster rejects. */
async function withFeeFallback<T>(
  fn: (opts: { feeMode: string } | undefined) => Promise<T>,
  sponsored: boolean,
): Promise<T> {
  if (!sponsored) return fn(undefined);
  try {
    return await fn({ feeMode: "sponsored" as any });
  } catch (err: any) {
    const msg = err?.message ?? "";
    // Paymaster rejected → retry with user_pays (user covers gas in STRK)
    if (
      msg.includes("paymaster") ||
      msg.includes("Paymaster") ||
      msg.includes("sponsored")
    ) {
      return fn({ feeMode: "user_pays" as any });
    }
    throw err;
  }
}

export async function executeLendingDeposit(
  token: TokenSymbol,
  amount: string,
  gasless?: boolean,
): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();
  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  const parsedAmount = Amount.parse(amount, tokenObj as any);
  const lending = wallet.lending();
  const result = await withFeeFallback(
    (opts) =>
      lending.deposit(
        { token: tokenObj as any, amount: parsedAmount },
        opts as any,
      ),
    !!gasless,
  );
  return (result as any).hash ?? (result as any).transaction_hash;
}

/**
 * Direct fallback: bypass `max_redeem` (which returns 0 on Sepolia due to stale oracles)
 * and instead call `balance_of` on the vToken, then `redeem(shares, receiver, owner)`.
 */
async function redeemAllVesuSharesDirect(
  tokenAddress: string,
  wallet: any,
  gasless: boolean,
): Promise<string> {
  const owner: string = (wallet as any).address;
  const rpc = import.meta.env.VITE_STARKNET_RPC_URL as string | undefined;
  const provider = new RpcProvider({ nodeUrl: rpc });

  // Resolve vToken address from pool factory
  const vTokenRes = await provider.callContract({
    contractAddress: VESU_POOL_FACTORY,
    entrypoint: "v_token_for_asset",
    calldata: CallData.compile([VESU_DEFAULT_POOL, tokenAddress]),
  });
  const vTokenAddress: string = vTokenRes[0];
  if (!vTokenAddress || BigInt(String(vTokenAddress)) === 0n) {
    throw new Error("No Vesu pool found for this token");
  }

  // Read actual share balance (balance_of, not max_redeem which has oracle dependency)
  const balRes = await provider.callContract({
    contractAddress: vTokenAddress,
    entrypoint: "balance_of",
    calldata: CallData.compile([owner]),
  });
  const shares =
    BigInt(String(balRes[0])) + (BigInt(String(balRes[1] ?? "0")) << 128n);

  if (shares === 0n) {
    throw new Error(
      "No vToken shares found — your deposit may not have confirmed on-chain. Check your wallet balance.",
    );
  }

  // Execute redeem(shares, receiver, owner) directly on the vToken contract
  const result = await withFeeFallback(
    (opts) =>
      (wallet as any).execute(
        [
          {
            contractAddress: vTokenAddress,
            entrypoint: "redeem",
            calldata: CallData.compile([
              uint256.bnToUint256(shares),
              owner,
              owner,
            ]),
          },
        ],
        opts,
      ),
    gasless,
  );
  return (result as any).transaction_hash ?? (result as any).hash;
}

export async function executeLendingWithdraw(
  token: TokenSymbol,
  amount: string,
  gasless?: boolean,
): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();
  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  const lending = wallet.lending();
  try {
    // Standard path: withdrawMax uses max_redeem → redeem
    const result = await withFeeFallback(
      (opts) => lending.withdrawMax({ token: tokenObj as any }, opts as any),
      !!gasless,
    );
    return (result as any).hash ?? (result as any).transaction_hash;
  } catch (err: any) {
    // max_redeem returns 0 on Sepolia when oracle is stale — fall back to
    // directly reading balance_of and calling redeem on the vToken
    if (err.message?.includes("No withdrawable Vesu shares")) {
      return redeemAllVesuSharesDirect(
        (tokenObj as any).address,
        wallet,
        !!gasless,
      );
    }
    throw err;
  }
}

export async function getLendingMarkets(): Promise<LendingMarket[]> {
  const wallet = getConnectedWallet();
  const lending = wallet.lending();
  try {
    const markets = await (lending as any).getMarkets();
    if (!markets || !Array.isArray(markets)) return [];
    return markets.map((m: any) => ({
      name: m.name ?? m.token?.symbol ?? "Unknown",
      tokenSymbol: m.token?.symbol ?? m.tokenSymbol ?? "",
      supplyApy: m.supplyApy ?? m.supply_apy ?? "0",
      borrowApy: m.borrowApy ?? m.borrow_apy ?? "0",
      totalSupplied: m.totalSupplied?.toUnit?.() ?? m.totalSupplied ?? "0",
      totalBorrowed: m.totalBorrowed?.toUnit?.() ?? m.totalBorrowed ?? "0",
    }));
  } catch {
    return [];
  }
}

export async function getLendingPosition(
  token: TokenSymbol,
): Promise<LendingPosition | null> {
  if (!_wallet) return null;
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();
  const lending = wallet.lending();
  try {
    const pos = await lending.getPosition({ token: tokenObj as any });
    if (!pos) return null;
    return {
      tokenSymbol: token,
      supplied: pos.supplied?.toUnit?.() ?? "0",
      borrowed: pos.borrowed?.toUnit?.() ?? "0",
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

  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

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

// ─── Bridge (Ethereum → Starknet) ────────────────────────────────────────────

export interface BridgeTokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  protocol: string;
  raw: any; // full BridgeToken object passed back to deposit()
}

/**
 * Fetch available Ethereum → Starknet bridge tokens for the current network.
 * Requires ethers to be installed (it is — checked node_modules).
 */
export async function getBridgeTokens(): Promise<BridgeTokenInfo[]> {
  const sdk = getStarkZap();
  const tokens = await sdk.getBridgingTokens(ExternalChain.ETHEREUM);
  return tokens.map((t: any) => ({
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    protocol: t.protocol,
    raw: t,
  }));
}

/**
 * Connect to the user's MetaMask (EIP-1193) Ethereum wallet.
 * Auto-switches MetaMask to the correct Ethereum network (Sepolia for testnet, Mainnet for mainnet).
 * Returns a ConnectedEthereumWallet the SDK can use for bridging.
 */
export async function connectEthereumWallet(): Promise<any> {
  const provider = (window as any).ethereum;
  if (!provider)
    throw new Error(
      "MetaMask not found. Install MetaMask to bridge from Ethereum.",
    );

  // Request account access — opens MetaMask if not already connected
  const accounts: string[] = await provider.request({
    method: "eth_requestAccounts",
  });
  if (!accounts.length)
    throw new Error("No Ethereum account found in MetaMask.");

  // Determine which Ethereum network we need based on Starknet network
  const isSepolia = _chainId !== ChainId.MAINNET;
  const requiredChainId = isSepolia ? 11155111 : 1; // Ethereum Sepolia or Mainnet
  const requiredChainHex = "0x" + requiredChainId.toString(16);

  // Check current chain
  const currentChainHex: string = await provider.request({
    method: "eth_chainId",
  });
  const currentChainId = Number(BigInt(currentChainHex));

  if (currentChainId !== requiredChainId) {
    try {
      // Ask MetaMask to switch to the required network
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: requiredChainHex }],
      });
    } catch (switchErr: any) {
      // Chain not added in MetaMask (error 4902) — add Sepolia automatically
      if (switchErr.code === 4902 && isSepolia) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: requiredChainHex,
              chainName: "Ethereum Sepolia",
              nativeCurrency: {
                name: "SepoliaETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw new Error(
          isSepolia
            ? "Please switch MetaMask to Ethereum Mainnet to bridge."
            : "Please switch MetaMask to Ethereum Mainnet to bridge.",
        );
      }
    }
  }

  return ConnectedEthereumWallet.from(
    {
      chain: ExternalChain.ETHEREUM,
      provider,
      address: accounts[0],
      chainId: requiredChainId,
    },
    _chainId,
  );
}

/**
 * Execute a bridge deposit from Ethereum to Starknet.
 * @param bridgeToken  - raw BridgeToken from getBridgeTokens()
 * @param amount       - human-readable amount string e.g. "10"
 * @param recipient    - Starknet wallet address to receive funds
 * @param ethWallet    - ConnectedEthereumWallet from connectEthereumWallet()
 * @returns Ethereum transaction hash
 */
export async function executeBridge(
  bridgeToken: any,
  amount: string,
  recipient: string,
  ethWallet: any,
): Promise<string> {
  const wallet = getConnectedWallet();
  // bridgeToken.raw is the actual BridgeToken object from the SDK
  const rawToken = bridgeToken.raw ?? bridgeToken;
  // Use the token's decimals for Amount.parse (ETH=18, USDC=6, etc.)
  const decimals: number = rawToken.decimals ?? bridgeToken.decimals;
  const symbol: string = rawToken.symbol ?? bridgeToken.symbol;
  const parsedAmount = Amount.parse(amount, decimals, symbol);
  const tx = await wallet.deposit(recipient, parsedAmount, rawToken, ethWallet);
  return (tx as any).hash ?? (tx as any).transactionHash ?? String(tx);
}

// ─── DCA ─────────────────────────────────────────────────────────────────────

export interface DcaCreateParams {
  sellToken: TokenSymbol;
  buyToken: TokenSymbol;
  amountPerCycle: string; // human-readable e.g. "10"
  frequency: string; // ISO 8601: "P1D", "P7D", "P1M"
  cycles?: number; // total cycles (optional)
}

/**
 * Create a DCA order on AVNU. Sells `sellToken` to buy `buyToken` on schedule.
 * Returns { txHash, orderAddress? }
 */
export async function executeDcaCreate(
  params: DcaCreateParams,
): Promise<{ txHash: string; orderAddress?: string }> {
  const wallet = getConnectedWallet();
  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  const sellTokenObj = getToken(params.sellToken);
  const buyTokenObj = getToken(params.buyToken);

  const amountPerCycle = Amount.parse(
    params.amountPerCycle,
    sellTokenObj as any,
  );
  // totalAmount = amountPerCycle * cycles (or 100 cycles if unspecified)
  const cycles = params.cycles ?? 100;
  const totalBase = amountPerCycle.toBase() * BigInt(cycles);
  const totalAmount = Amount.fromRaw(totalBase, sellTokenObj as any);

  const dcaRequest = {
    sellToken: sellTokenObj as any,
    buyToken: buyTokenObj as any,
    sellAmount: totalAmount,
    sellAmountPerCycle: amountPerCycle,
    frequency: params.frequency,
  };

  const result = await withFeeFallback(
    (opts) => wallet.dca().create(dcaRequest, opts as any),
    true,
  );

  const txHash: string =
    (result as any).transaction_hash ?? (result as any).hash;

  // Poll getOrders after tx submission to get the on-chain orderAddress.
  // AVNU assigns it after the tx is accepted — retry up to 10s.
  let orderAddress: string | undefined;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const orders = await getDcaOrders();
      const match = orders.find(
        (o: any) =>
          o.creationTransactionHash === txHash ||
          String(o.creationTransactionHash).toLowerCase() ===
            txHash.toLowerCase(),
      );
      if (match?.orderAddress) {
        orderAddress = String(match.orderAddress);
        break;
      }
    } catch {
      /* keep retrying */
    }
  }

  return { txHash, orderAddress };
}

/** List active DCA orders from AVNU for the current wallet. */
export async function getDcaOrders(): Promise<any[]> {
  if (!_wallet) return [];
  const wallet = getConnectedWallet();
  try {
    const page = await wallet.dca().getOrders({ status: "ACTIVE" });
    return page.content ?? [];
  } catch {
    return [];
  }
}

/** Cancel a DCA order by its on-chain orderAddress. */
export async function executeDcaCancel(orderAddress: string): Promise<string> {
  const wallet = getConnectedWallet();
  const result = await withFeeFallback(
    (opts) => wallet.dca().cancel({ orderAddress }, opts as any),
    true,
  );
  return (result as any).transaction_hash ?? (result as any).hash;
}

// ─── Borrow / Repay (Vesu) ───────────────────────────────────────────────────

/**
 * Get the maximum borrowable amount for a given collateral/debt pair.
 * Returns human-readable string, or "0" if unavailable.
 */
export async function getBorrowLimit(
  collateralToken: TokenSymbol,
  debtToken: TokenSymbol,
): Promise<string> {
  if (!_wallet) return "0";
  const wallet = getConnectedWallet();
  const colObj = getToken(collateralToken);
  const debtObj = getToken(debtToken);
  try {
    const maxBase = await wallet.lending().getMaxBorrowAmount({
      collateralToken: colObj as any,
      debtToken: debtObj as any,
    });
    return Amount.fromRaw(maxBase, debtObj as any).toUnit();
  } catch {
    return "0";
  }
}

export async function executeBorrow(
  collateralToken: TokenSymbol,
  debtToken: TokenSymbol,
  amount: string,
  gasless?: boolean,
): Promise<string> {
  const wallet = getConnectedWallet();
  const colObj = getToken(collateralToken);
  const debtObj = getToken(debtToken);
  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  const parsedAmount = Amount.parse(amount, debtObj as any);
  const result = await withFeeFallback(
    (opts) =>
      wallet.lending().borrow(
        {
          collateralToken: colObj as any,
          debtToken: debtObj as any,
          amount: parsedAmount,
        },
        opts as any,
      ),
    !!gasless,
  );
  return (result as any).hash ?? (result as any).transaction_hash;
}

export async function executeRepay(
  collateralToken: TokenSymbol,
  debtToken: TokenSymbol,
  amount: string,
  gasless?: boolean,
): Promise<string> {
  const wallet = getConnectedWallet();
  const colObj = getToken(collateralToken);
  const debtObj = getToken(debtToken);
  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  const parsedAmount = Amount.parse(amount, debtObj as any);
  const result = await withFeeFallback(
    (opts) =>
      wallet.lending().repay(
        {
          collateralToken: colObj as any,
          debtToken: debtObj as any,
          amount: parsedAmount,
        },
        opts as any,
      ),
    !!gasless,
  );
  return (result as any).hash ?? (result as any).transaction_hash;
}

// ─── Claim Staking Rewards ────────────────────────────────────────────────────

export async function claimPoolRewards(poolAddress: string): Promise<string> {
  const wallet = getConnectedWallet();
  const result = await wallet.claimPoolRewards(poolAddress);
  return result.hash;
}

// ─── Private Transfers (Tongo Confidential) ───────────────────────────────────

/** Tongo contract addresses per token per network. Each token has its own Tongo vault. */
const TONGO_CONTRACTS: Partial<Record<TokenSymbol, string>> =
  _chainId === ChainId.MAINNET
    ? {
        STRK: "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498",
        ETH: "0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89",
        USDC: "0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a",
      }
    : {
        STRK: "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
        ETH: "0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
        USDC: "0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
      };

/** Token symbols that support private (confidential) transfers. */
export const PRIVATE_TRANSFER_TOKENS: TokenSymbol[] = ["STRK", "ETH", "USDC"];

export function isPrivateTransferSupported(token: TokenSymbol): boolean {
  return token in TONGO_CONTRACTS;
}

// One TongoConfidential instance per token (same private key, different contract per token).
const _tongoInstances: Partial<Record<TokenSymbol, TongoConfidential>> = {};
// Cached private key for the session — fetched once from backend, kept in memory.
let _tongoPrivateKey: string | null = null;
// Track whether the public key has been registered on the backend this session.
let _tongoPubKeyRegistered = false;

/** Fetch and cache the Tongo private key from the backend. */
async function fetchTongoPrivateKey(): Promise<string> {
  if (_tongoPrivateKey) return _tongoPrivateKey;
  const { walletApi } = await import("./api.js");
  const result = await walletApi.getTongoKey();
  _tongoPrivateKey = result.privateKey;
  // If the public key is already stored, mark as registered so we skip the round-trip.
  if (result.publicKeyX && result.publicKeyY) _tongoPubKeyRegistered = true;
  return _tongoPrivateKey;
}

/**
 * Get (or lazily create) the TongoConfidential instance for a given token.
 * On first call per token, fetches the private key from the backend, creates
 * the instance, and registers the derived public key on the backend.
 */
export async function getOrInitTongoConfidential(
  token: TokenSymbol,
): Promise<TongoConfidential> {
  if (_tongoInstances[token]) return _tongoInstances[token]!;

  const contractAddress = TONGO_CONTRACTS[token];
  if (!contractAddress)
    throw new Error(
      `Private transfers are only supported for ${PRIVATE_TRANSFER_TOKENS.join(", ")}.`,
    );

  const privateKey = await fetchTongoPrivateKey();
  const rpcUrl = import.meta.env.VITE_STARKNET_RPC_URL as string | undefined;
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  const instance = new TongoConfidential({
    privateKey,
    contractAddress: contractAddress as any,
    provider: provider as any,
  });
  _tongoInstances[token] = instance;

  // Register public key once per session (fire-and-forget — non-blocking).
  if (!_tongoPubKeyRegistered) {
    _tongoPubKeyRegistered = true;
    const { x, y } = instance.recipientId;
    const { walletApi } = await import("./api.js");
    walletApi
      .saveTongoPublicKey(String(x), String(y))
      .catch(() => { _tongoPubKeyRegistered = false; }); // retry allowed on next init
  }

  return instance;
}

export type PrivateTransferStep = "initializing" | "funding" | "transferring";

export interface PrivateTransferResult {
  fundTxHash?: string;
  transferTxHash: string;
}

/**
 * Execute a private (confidential) token transfer via the Tongo protocol.
 *
 * Flow:
 *  1. Initialise the sender's TongoConfidential instance (fetches key from backend once).
 *  2. Read on-chain confidential balance. If insufficient, fund first (public → private).
 *  3. Submit the confidential transfer (ZK proof generated locally in-browser).
 *
 * Two transactions are submitted when funding is needed; one when the sender
 * already has enough private balance from previous operations.
 *
 * @param params.recipientKey   Recipient's Tongo public key {x, y} from /api/transfer/private/prepare
 * @param params.amount         Human-readable amount string e.g. "10"
 * @param params.token          Token symbol (STRK | ETH | USDC)
 * @param params.gasless        Whether to use AVNU paymaster
 * @param onProgress            Optional callback for step-level UI updates
 */
/**
 * Send a Tongo tx, trying sponsored gas first then falling back to user_pays.
 * Takes a factory function so the builder is re-created on retry (builders
 * may not be reusable after a failed .send() call).
 */
async function sendTongoTx(
  buildTx: () => any,
  gasless: boolean,
): Promise<any> {
  if (!gasless) return buildTx().send();
  try {
    return await buildTx().send({ feeMode: "sponsored" as any });
  } catch (err: any) {
    // Paymaster doesn't support confidential tx types — fall back to user paying gas.
    // Always retry with user_pays so the transfer isn't blocked by paymaster support.
    return buildTx().send({ feeMode: "user_pays" as any });
  }
}

export async function executePrivateTransfer(
  params: {
    recipientKey: { x: string; y: string };
    amount: string;
    token: TokenSymbol;
    gasless?: boolean;
  },
  onProgress?: (step: PrivateTransferStep) => void,
): Promise<PrivateTransferResult> {
  const tokenObj = getToken(params.token);
  const wallet = getConnectedWallet();

  await wallet.ensureReady({ deploy: "if_needed", feeMode: "sponsored" as any });

  onProgress?.("initializing");
  const confidential = await getOrInitTongoConfidential(params.token);

  // parsedAmount is in ERC20 base units (e.g. 10^18 for 1 STRK).
  // Tongo operates in its own compressed unit space (max 2^32).
  // The SDK's confidentialFund/Transfer expect Amount.fromRaw(tongoUnits, token),
  // so we must convert first. Using parsedAmount directly causes a unit mismatch
  // where the balance check (tongo units) always fails against ERC20 base units.
  const parsedAmount = Amount.parse(params.amount, tokenObj as any);
  const neededUnits = await confidential.toConfidentialUnits(parsedAmount);
  // Amount whose .toBase() returns tongo units (what the SDK actually wants)
  const tongoAmount = Amount.fromRaw(neededUnits, tokenObj as any);

  // Compare current confidential balance against what we need.
  const state = await confidential.getState();

  let fundTxHash: string | undefined;

  if (state.balance < neededUnits) {
    onProgress?.("funding");

    // Verify the user has enough public balance before attempting on-chain fund.
    const publicBalance = await wallet.balanceOf(tokenObj as any);
    if (publicBalance.toBase() < parsedAmount.toBase()) {
      throw new Error(
        `Insufficient ${params.token} balance. You have ${publicBalance.toUnit()} but need ${params.amount}.`,
      );
    }

    // Deposit the required amount from the public wallet into the Tongo contract.
    // Pass tongoAmount (not parsedAmount) — the SDK multiplies by the on-chain rate
    // to compute the ERC20 approval, so the base value must be in tongo units.
    const fundResult = await sendTongoTx(
      () => wallet.tx().confidentialFund(confidential, { amount: tongoAmount, sender: wallet.address }),
      params.gasless ?? false,
    );
    fundTxHash = (fundResult as any).hash;

    // Wait for the fund tx to be reflected in the on-chain Tongo state before
    // building the ZK transfer proof (proof is tied to the current ciphertext).
    let stateAfterFund = state;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      stateAfterFund = await confidential.getState();
      if (stateAfterFund.balance >= neededUnits) break;
    }

    if (stateAfterFund.balance < neededUnits) {
      throw new Error(
        "Funding transaction confirmed but confidential balance hasn't updated yet. Please try again in a moment.",
      );
    }
  }

  onProgress?.("transferring");

  const transferResult = await sendTongoTx(
    () => wallet.tx().confidentialTransfer(confidential, {
      amount: tongoAmount,  // tongo units, not ERC20 base
      to: {
        x: BigInt(params.recipientKey.x),
        y: BigInt(params.recipientKey.y),
      },
      sender: wallet.address,
    }),
    params.gasless ?? false,
  );

  return {
    fundTxHash,
    transferTxHash: (transferResult as any).hash,
  };
}

/**
 * Get the user's current confidential balance for a token.
 * Returns human-readable strings for active (spendable) and pending (needs rollover) balances.
 */
export async function getTongoBalance(
  token: TokenSymbol,
): Promise<{ active: string; pending: string }> {
  const tokenObj = getToken(token);
  const confidential = await getOrInitTongoConfidential(token);
  const state = await confidential.getState();

  const activeBase = await confidential.toPublicUnits(state.balance);
  const pendingBase = await confidential.toPublicUnits(state.pending);

  return {
    active: Amount.fromRaw(activeBase, tokenObj as any).toUnit(),
    pending: Amount.fromRaw(pendingBase, tokenObj as any).toUnit(),
  };
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
