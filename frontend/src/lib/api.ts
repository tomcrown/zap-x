/**
 * API client — thin wrapper around axios with auth header injection.
 * All requests go to the Zap-X backend via the /api prefix.
 */

import axios, { AxiosError } from 'axios';
import {
  Transaction,
  ClaimLink,
  StakingPosition,
  StakingStats,
  StakingPool,
  LendingPosition,
  LendingStats,
  SwapRecord,
  UserProfile,
  AIParseResult,
  TokenSymbol,
} from '../types/index.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

// ─── Axios Instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject Privy auth token from sessionStorage on every request
apiClient.interceptors.request.use((reqConfig) => {
  const token = sessionStorage.getItem('privy:token') ?? localStorage.getItem('zapx:devToken');
  if (token) reqConfig.headers.Authorization = `Bearer ${token}`;
  return reqConfig;
});

// Normalise errors
apiClient.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error: string }>) => {
    const message = err.response?.data?.error ?? err.message ?? 'Network error';
    return Promise.reject(new Error(message));
  }
);

// ─── Wallet ────────────────────────────────────────────────────────────────────

export const walletApi = {
  /** Get or create the user's Privy-managed Starknet wallet. Returns { walletId, publicKey, address }. */
  ensureStarknetWallet: () =>
    apiClient
      .post<{ walletId: string; publicKey: string; address: string }>('/wallet/starknet')
      .then((r) => r.data),

  /** Sign endpoint URL — must be an absolute URL for Starkzap's PrivySigner validation. */
  get signUrl() {
    const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';
    return `${backendUrl}/api/wallet/sign`;
  },
};

// ─── User ──────────────────────────────────────────────────────────────────────

export const userApi = {
  register: (body: { walletAddress: string; username?: string; email?: string }) =>
    apiClient.post<{ profile: UserProfile }>('/users/register', body).then((r) => r.data.profile),

  me: () =>
    apiClient.get<{ profile: UserProfile }>('/users/me').then((r) => r.data.profile),

  lookup: (identifier: string) =>
    apiClient
      .get<{ found: boolean; walletAddress?: string; username?: string }>(`/users/lookup/${encodeURIComponent(identifier)}`)
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
      .post<PrepareTransferResult>('/transfer/prepare', body)
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
      .post<{ success: boolean; txHash?: string; claimToken?: string; claimLink?: string; message: string }>('/transfer/confirm', body)
      .then((r) => r.data),

  history: () =>
    apiClient.get<{ transactions: Transaction[] }>('/transfer/history').then((r) => r.data.transactions),
};

// ─── Claim ────────────────────────────────────────────────────────────────────

export const claimApi = {
  get: (token: string) =>
    apiClient.get<{ claim: ClaimLink }>(`/claim/${token}`).then((r) => r.data.claim),

  list: () =>
    apiClient.get<{ claims: ClaimLink[] }>('/claim').then((r) => r.data.claims),

  redeem: (token: string, recipientWallet: string) =>
    apiClient
      .post<{ success: boolean; txHash: string }>(`/claim/${token}/redeem`, { recipientWallet })
      .then((r) => r.data),

  cancel: (token: string) =>
    apiClient
      .post<{ success: boolean; txHash: string }>(`/claim/${token}/cancel`, {})
      .then((r) => r.data),
};

// ─── Staking ──────────────────────────────────────────────────────────────────

export const stakingApi = {
  pools: () =>
    apiClient.get<{ pools: StakingPool[] }>('/staking/pools').then((r) => r.data.pools),

  stats: () =>
    apiClient.get<{ stats: StakingStats }>('/staking/stats').then((r) => r.data.stats),

  positions: () =>
    apiClient.get<{ positions: StakingPosition[] }>('/staking/positions').then((r) => r.data.positions),

  record: (body: { userWallet: string; poolAddress: string; amount: string; token: TokenSymbol; txHash: string }) =>
    apiClient.post<{ position: StakingPosition }>('/staking/record', body).then((r) => r.data.position),

  recordExitIntent: (positionId: number, txHash: string) =>
    apiClient.post('/staking/exit-intent', { positionId, txHash }).then((r) => r.data),

  recordExit: (positionId: number, txHash: string) =>
    apiClient.post('/staking/exit', { positionId, txHash }).then((r) => r.data),
};

// ─── Lending ──────────────────────────────────────────────────────────────────

export const lendingApi = {
  stats: () =>
    apiClient.get<{ stats: LendingStats }>('/lending/stats').then((r) => r.data.stats),

  positions: () =>
    apiClient.get<{ positions: LendingPosition[] }>('/lending/positions').then((r) => r.data.positions),

  deposit: (body: { token: string; amount: string; txHash: string }) =>
    apiClient.post<{ position: LendingPosition }>('/lending/deposit', body).then((r) => r.data.position),

  withdraw: (positionId: number, txHash: string) =>
    apiClient.post('/lending/withdraw', { positionId, txHash }).then((r) => r.data),
};

// ─── Swap ─────────────────────────────────────────────────────────────────────

export const swapApi = {
  history: () =>
    apiClient.get<{ swaps: SwapRecord[] }>('/swap/history').then((r) => r.data.swaps),

  record: (body: { tokenIn: string; tokenOut: string; amountIn: string; amountOut: string; txHash: string; provider: string }) =>
    apiClient.post<{ swap: SwapRecord }>('/swap/record', body).then((r) => r.data.swap),
};

// ─── AI ───────────────────────────────────────────────────────────────────────

export const aiApi = {
  parse: (command: string) =>
    apiClient.post<AIParseResult>('/ai/parse', { command }).then((r) => r.data),
};
