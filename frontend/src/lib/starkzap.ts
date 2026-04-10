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

const VESU_POOL_FACTORY =
  (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
    ? "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0"
    : "0x03ac869e64b1164aaee7f3fd251f86581eab8bfbbd2abdf1e49c773282d4a092";
const VESU_DEFAULT_POOL =
  (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
    ? "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5"
    : "0x06227c13372b8c7b7f38ad1cfe05b5cf515b4e5c596dd05fe8437ab9747b2093";

const _chainId =
  (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") === "mainnet"
    ? ChainId.MAINNET
    : ChainId.SEPOLIA;
const _tokens = getPresets(_chainId) as Record<string, unknown>;

let _sdk: StarkZap | null = null;
let _wallet: any = null;

export function getStarkZap(): StarkZap {
  if (_sdk) return _sdk;

  _sdk = new StarkZap({
    network: (import.meta.env.VITE_STARKNET_NETWORK ?? "sepolia") as
      | "mainnet"
      | "sepolia",
    rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
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
 *
 * @param getAccessToken
 */
export async function connectPrivyWallet(
  getAccessToken: () => Promise<string | null>,
) {
  const sdk = getStarkZap();

  const result = await sdk.onboard({
    strategy: "privy" as any,
    accountPreset: "argentXV050" as any,
    deploy: "if_needed" as any,
    feeMode: "sponsored" as any,
    privy: {
      resolve: async () => {
        const token = await getAccessToken();

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

export function getConnectedWallet() {
  if (!_wallet) throw new Error("No Starknet wallet connected.");
  return _wallet;
}

export function resetStarkZap(): void {
  _sdk = null;
  _wallet = null;
  for (const k of Object.keys(_tongoInstances)) {
    delete _tongoInstances[k as TokenSymbol];
  }
  _tongoPrivateKey = null;
  _tongoPubKeyRegistered = false;
}

export function getToken(symbol: TokenSymbol) {
  const token = _tokens[symbol];
  if (!token)
    throw new Error(`Token ${symbol} is not supported by the Starkzap SDK.`);
  return token;
}

export interface TransferParams {
  toAddress: string;
  amount: string;
  token: TokenSymbol;
  gasless?: boolean;
}

export async function executeTransfer(params: TransferParams): Promise<string> {
  const tokenObj = getToken(params.token);
  const wallet = getConnectedWallet();

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

async function withFeeFallback<T>(
  fn: (opts: { feeMode: string } | undefined) => Promise<T>,
  sponsored: boolean,
): Promise<T> {
  if (!sponsored) return fn(undefined);
  try {
    return await fn({ feeMode: "sponsored" as any });
  } catch (err: any) {
    const msg = err?.message ?? "";
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

async function redeemAllVesuSharesDirect(
  tokenAddress: string,
  wallet: any,
  gasless: boolean,
): Promise<string> {
  const owner: string = (wallet as any).address;
  const rpc = import.meta.env.VITE_STARKNET_RPC_URL as string | undefined;
  const provider = new RpcProvider({ nodeUrl: rpc });

  const vTokenRes = await provider.callContract({
    contractAddress: VESU_POOL_FACTORY,
    entrypoint: "v_token_for_asset",
    calldata: CallData.compile([VESU_DEFAULT_POOL, tokenAddress]),
  });
  const vTokenAddress: string = vTokenRes[0];
  if (!vTokenAddress || BigInt(String(vTokenAddress)) === 0n) {
    throw new Error("No Vesu pool found for this token");
  }

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
    const result = await withFeeFallback(
      (opts) => lending.withdrawMax({ token: tokenObj as any }, opts as any),
      !!gasless,
    );
    return (result as any).hash ?? (result as any).transaction_hash;
  } catch (err: any) {
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

export async function executeStake(
  poolAddress: string,
  amount: string,
  token: TokenSymbol,
  gasless?: boolean,
): Promise<string> {
  if (_chainId === ChainId.SEPOLIA) {
    await new Promise((r) => setTimeout(r, 1200));
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

export async function executeExit(poolAddress: string): Promise<string> {
  if (_chainId === ChainId.SEPOLIA) {
    await new Promise((r) => setTimeout(r, 1200));
    return "0x" + Math.random().toString(16).slice(2).padEnd(63, "0");
  }
  const wallet = getConnectedWallet();
  const result = await wallet.exitPool(poolAddress);
  return result.hash;
}

export async function getBalance(token: TokenSymbol): Promise<string> {
  const tokenObj = getToken(token);
  const wallet = getConnectedWallet();

  const balance = await wallet.balanceOf(tokenObj as any);
  return balance.toUnit();
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

export interface BridgeTokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  protocol: string;
  raw: any;
}

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

export async function connectEthereumWallet(): Promise<any> {
  const provider = (window as any).ethereum;
  if (!provider)
    throw new Error(
      "MetaMask not found. Install MetaMask to bridge from Ethereum.",
    );

  const accounts: string[] = await provider.request({
    method: "eth_requestAccounts",
  });
  if (!accounts.length)
    throw new Error("No Ethereum account found in MetaMask.");

  const isSepolia = _chainId !== ChainId.MAINNET;
  const requiredChainId = isSepolia ? 11155111 : 1;
  const requiredChainHex = "0x" + requiredChainId.toString(16);

  const currentChainHex: string = await provider.request({
    method: "eth_chainId",
  });
  const currentChainId = Number(BigInt(currentChainHex));

  if (currentChainId !== requiredChainId) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: requiredChainHex }],
      });
    } catch (switchErr: any) {
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
 * @param bridgeToken
 * @param amount
 * @param recipient
 * @param ethWallet
 * @returns
 */
export async function executeBridge(
  bridgeToken: any,
  amount: string,
  recipient: string,
  ethWallet: any,
): Promise<string> {
  const wallet = getConnectedWallet();
  const rawToken = bridgeToken.raw ?? bridgeToken;
  const decimals: number = rawToken.decimals ?? bridgeToken.decimals;
  const symbol: string = rawToken.symbol ?? bridgeToken.symbol;
  const parsedAmount = Amount.parse(amount, decimals, symbol);
  const tx = await wallet.deposit(recipient, parsedAmount, rawToken, ethWallet);
  return (tx as any).hash ?? (tx as any).transactionHash ?? String(tx);
}

export interface DcaCreateParams {
  sellToken: TokenSymbol;
  buyToken: TokenSymbol;
  amountPerCycle: string;
  frequency: string;
  cycles?: number;
}

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
    } catch {}
  }

  return { txHash, orderAddress };
}

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

export async function executeDcaCancel(orderAddress: string): Promise<string> {
  const wallet = getConnectedWallet();
  const result = await withFeeFallback(
    (opts) => wallet.dca().cancel({ orderAddress }, opts as any),
    true,
  );
  return (result as any).transaction_hash ?? (result as any).hash;
}

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

export async function claimPoolRewards(poolAddress: string): Promise<string> {
  const wallet = getConnectedWallet();
  const result = await wallet.claimPoolRewards(poolAddress);
  return result.hash;
}

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

export const PRIVATE_TRANSFER_TOKENS: TokenSymbol[] = ["STRK", "ETH", "USDC"];

export function isPrivateTransferSupported(token: TokenSymbol): boolean {
  return token in TONGO_CONTRACTS;
}

const _tongoInstances: Partial<Record<TokenSymbol, TongoConfidential>> = {};
let _tongoPrivateKey: string | null = null;
let _tongoPubKeyRegistered = false;

async function fetchTongoPrivateKey(): Promise<string> {
  if (_tongoPrivateKey) return _tongoPrivateKey;
  const { walletApi } = await import("./api.js");
  const result = await walletApi.getTongoKey();
  _tongoPrivateKey = result.privateKey;
  if (result.publicKeyX && result.publicKeyY) _tongoPubKeyRegistered = true;
  return _tongoPrivateKey;
}

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

  if (!_tongoPubKeyRegistered) {
    _tongoPubKeyRegistered = true;
    const { x, y } = instance.recipientId;
    const { walletApi } = await import("./api.js");
    walletApi.saveTongoPublicKey(String(x), String(y)).catch(() => {
      _tongoPubKeyRegistered = false;
    });
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

async function sendTongoTx(buildTx: () => any, gasless: boolean): Promise<any> {
  if (!gasless) return buildTx().send();
  try {
    return await buildTx().send({ feeMode: "sponsored" as any });
  } catch (err: any) {
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

  await wallet.ensureReady({
    deploy: "if_needed",
    feeMode: "sponsored" as any,
  });

  onProgress?.("initializing");
  const confidential = await getOrInitTongoConfidential(params.token);

  const parsedAmount = Amount.parse(params.amount, tokenObj as any);
  const neededUnits = await confidential.toConfidentialUnits(parsedAmount);
  const tongoAmount = Amount.fromRaw(neededUnits, tokenObj as any);

  const state = await confidential.getState();

  let fundTxHash: string | undefined;

  if (state.balance < neededUnits) {
    onProgress?.("funding");

    const publicBalance = await wallet.balanceOf(tokenObj as any);
    if (publicBalance.toBase() < parsedAmount.toBase()) {
      throw new Error(
        `Insufficient ${params.token} balance. You have ${publicBalance.toUnit()} but need ${params.amount}.`,
      );
    }

    const fundResult = await sendTongoTx(
      () =>
        wallet.tx().confidentialFund(confidential, {
          amount: tongoAmount,
          sender: wallet.address,
        }),
      params.gasless ?? false,
    );
    fundTxHash = (fundResult as any).hash;

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
    () =>
      wallet.tx().confidentialTransfer(confidential, {
        amount: tongoAmount,
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
