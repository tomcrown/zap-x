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

// ─── AI ───────────────────────────────────────────────────────────────────────

export const aiApi = {
  parse: (command: string) =>
    apiClient.post<AIParseResult>('/ai/parse', { command }).then((r) => r.data),
};
