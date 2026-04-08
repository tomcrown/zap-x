/**
 * API client — thin wrapper around axios with auth header injection.
 * All requests go to the Zap-X backend via the /api prefix.
 */

import axios, { AxiosError } from "axios";
import {
  Transaction,
  ClaimLink,
  StakingPosition,
  StakingStats,
  StakingPool,
  LendingPosition,
  LendingStats,
  SwapRecord,
  ParsedAction,
  UserProfile,
  AIParseResult,
  TokenSymbol,
} from "../types/index.js";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

// ─── Axios Instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Allow WalletContext to register Privy's getAccessToken so we always get a fresh JWT
let _tokenGetter: (() => Promise<string | null>) | null = null;
export function registerTokenGetter(fn: () => Promise<string | null>) {
  _tokenGetter = fn;
}

// Inject Privy auth token — call fresh getter each time to avoid expired JWTs
apiClient.interceptors.request.use(async (reqConfig) => {
  const token = _tokenGetter
    ? await _tokenGetter().catch(() => sessionStorage.getItem("privy:token"))
    : (sessionStorage.getItem("privy:token") ??
      localStorage.getItem("zapx:devToken"));
  if (token) reqConfig.headers.Authorization = `Bearer ${token}`;
  return reqConfig;
});

// Normalise errors
apiClient.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error: string }>) => {
    const message = err.response?.data?.error ?? err.message ?? "Network error";
    return Promise.reject(new Error(message));
  },
);

// ─── Wallet ────────────────────────────────────────────────────────────────────

export const walletApi = {
  /** Get or create the user's Privy-managed Starknet wallet. Returns { walletId, publicKey, address }. */
  ensureStarknetWallet: () =>
    apiClient
      .post<{
        walletId: string;
        publicKey: string;
        address: string;
      }>("/wallet/starknet")
      .then((r) => r.data),

  /** Sign endpoint URL — must be an absolute URL for Starkzap's PrivySigner validation. */
  get signUrl() {
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";
    return `${backendUrl}/api/wallet/sign`;
  },
};

// ─── User ──────────────────────────────────────────────────────────────────────

export const userApi = {
  register: (body: {
    walletAddress: string;
    username?: string;
    email?: string;
  }) =>
    apiClient
      .post<{ profile: UserProfile }>("/users/register", body)
      .then((r) => r.data.profile),

  me: () =>
    apiClient
      .get<{ profile: UserProfile }>("/users/me")
      .then((r) => r.data.profile),

  lookup: (identifier: string) =>
    apiClient
      .get<{
        found: boolean;
        walletAddress?: string;
        username?: string;
      }>(`/users/lookup/${encodeURIComponent(identifier)}`)
      .then((r) => r.data),
};

// ─── Transfer ─────────────────────────────────────────────────────────────────

export interface PrepareTransferResult {
  toAddress: string;
  needsEscrow: boolean;
  recipientEmail?: string;
}

export const transferApi = {
  prepare: (body: {
    senderWallet: string;
    recipient: string;
    amount: string;
    token: TokenSymbol;
    note?: string;
    gasless?: boolean;
  }) =>
    apiClient
      .post<PrepareTransferResult>("/transfer/prepare", body)
      .then((r) => r.data),

  confirm: (body: {
    senderWallet: string;
    recipient: string;
    amount: string;
    token: TokenSymbol;
    txHash: string;
    note?: string;
    recipientEmail?: string;
    needsEscrow?: boolean;
  }) =>
    apiClient
      .post<{
        success: boolean;
        txHash?: string;
        claimToken?: string;
        claimLink?: string;
        message: string;
      }>("/transfer/confirm", body)
      .then((r) => r.data),

  history: () =>
    apiClient
      .get<{ transactions: Transaction[] }>("/transfer/history")
      .then((r) => r.data.transactions),
};

// ─── Claim ────────────────────────────────────────────────────────────────────

export const claimApi = {
  get: (token: string) =>
    apiClient
      .get<{ claim: ClaimLink }>(`/claim/${token}`)
      .then((r) => r.data.claim),

  list: () =>
    apiClient.get<{ claims: ClaimLink[] }>("/claim").then((r) => r.data.claims),

  redeem: (token: string, recipientWallet: string) =>
    apiClient
      .post<{
        success: boolean;
        txHash: string;
      }>(`/claim/${token}/redeem`, { recipientWallet })
      .then((r) => r.data),

  cancel: (token: string) =>
    apiClient
      .post<{ success: boolean; txHash: string }>(`/claim/${token}/cancel`, {})
      .then((r) => r.data),
};

// ─── Staking ──────────────────────────────────────────────────────────────────

export const stakingApi = {
  pools: () =>
    apiClient
      .get<{ pools: StakingPool[] }>("/staking/pools")
      .then((r) => r.data.pools),

  stats: () =>
    apiClient
      .get<{ stats: StakingStats }>("/staking/stats")
      .then((r) => r.data.stats),

  positions: () =>
    apiClient
      .get<{ positions: StakingPosition[] }>("/staking/positions")
      .then((r) => r.data.positions),

  record: (body: {
    userWallet: string;
    poolAddress: string;
    amount: string;
    token: TokenSymbol;
    txHash: string;
  }) =>
    apiClient
      .post<{ position: StakingPosition }>("/staking/record", body)
      .then((r) => r.data.position),

  recordExitIntent: (positionId: number, txHash: string) =>
    apiClient
      .post("/staking/exit-intent", { positionId, txHash })
      .then((r) => r.data),

  recordExit: (positionId: number, txHash: string) =>
    apiClient.post("/staking/exit", { positionId, txHash }).then((r) => r.data),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

/** A single item in the unified activity feed returned by GET /chat (history intent). */
export interface ActivityItem {
  kind: "send" | "receive" | "swap" | "dca" | "save" | "withdraw" | "bridge";
  token: string;
  amount: string;
  /** Recipient identifier, toToken, fromChain, etc. — depends on kind. */
  label: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export type ChatData =
  | { type: "history"; items: ActivityItem[] }
  | { type: "help" };

export const chatApi = {
  send: (message: string) =>
    apiClient
      .post<{
        success: boolean;
        message: string;
        confidence?: number;
        clarification?: string;
        warnings?: string[];
        actions: Array<
          ParsedAction & {
            ready: boolean;
            recipientAddress?: string;
            needsEscrow?: boolean;
            warning?: string;
          }
        >;
        data?: ChatData;
      }>("/chat", { message })
      .then((r) => r.data),
};

// ─── Lending ──────────────────────────────────────────────────────────────────

export const lendingApi = {
  stats: () =>
    apiClient
      .get<{ stats: LendingStats }>("/lending/stats")
      .then((r) => r.data.stats),

  positions: () =>
    apiClient
      .get<{ positions: LendingPosition[] }>("/lending/positions")
      .then((r) => r.data.positions),

  deposit: (body: { token: string; amount: string; txHash: string }) =>
    apiClient
      .post<{ position: LendingPosition }>("/lending/deposit", body)
      .then((r) => r.data.position),

  withdraw: (positionId: number, txHash: string) =>
    apiClient
      .post("/lending/withdraw", { positionId, txHash })
      .then((r) => r.data),

  void: (positionIds: number[]) =>
    apiClient.post("/lending/void", { positionIds }).then((r) => r.data),
};

// ─── Swap ─────────────────────────────────────────────────────────────────────

export const swapApi = {
  history: () =>
    apiClient
      .get<{ swaps: SwapRecord[] }>("/swap/history")
      .then((r) => r.data.swaps),

  record: (body: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    txHash: string;
    provider: string;
  }) =>
    apiClient
      .post<{ swap: SwapRecord }>("/swap/record", body)
      .then((r) => r.data.swap),
};

// ─── DCA ──────────────────────────────────────────────────────────────────────

export const dcaApi = {
  orders: () =>
    apiClient.get<{ orders: any[] }>("/dca/orders").then((r) => r.data.orders),

  record: (body: {
    sellToken: string;
    buyToken: string;
    amountPerCycle: string;
    frequency: string;
    txHash: string;
    orderAddress?: string;
  }) =>
    apiClient
      .post<{ success: boolean; order: any }>("/dca/record", body)
      .then((r) => r.data),

  cancel: (orderAddress: string, txHash: string) =>
    apiClient.post("/dca/cancel", { orderAddress, txHash }).then((r) => r.data),
};

// ─── Bridge ───────────────────────────────────────────────────────────────────

export const bridgeApi = {
  history: () =>
    apiClient
      .get<{ records: any[] }>("/bridge/history")
      .then((r) => r.data.records),

  record: (body: {
    token: string;
    amount: string;
    fromChain: string;
    txHash: string;
  }) =>
    apiClient
      .post<{ success: boolean; record: any }>("/bridge/record", body)
      .then((r) => r.data),
};

// ─── AI ───────────────────────────────────────────────────────────────────────

export const aiApi = {
  parse: (command: string) =>
    apiClient.post<AIParseResult>("/ai/parse", { command }).then((r) => r.data),
};
