/**
 * WalletContext
 *
 * Manages the global wallet state:
 *  - Privy authentication state
 *  - Starkzap SDK instance
 *  - Cached token balances
 *  - User profile from the backend
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { getStarkZap, resetStarkZap, getAllBalances } from '../lib/starkzap.js';
import { userApi } from '../lib/api.js';
import { UserProfile, TokenSymbol } from '../types/index.js';

interface WalletContextValue {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  privyUser: ReturnType<typeof usePrivy>['user'];

  // User profile
  profile: UserProfile | null;
  refreshProfile: () => Promise<void>;

  // Balances
  balances: Record<TokenSymbol, string>;
  refreshBalances: () => Promise<void>;
  balancesLoading: boolean;

  // Actions
  login: () => void;
  logout: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user, login, logout: privyLogout, ready, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balances, setBalances] = useState<Record<TokenSymbol, string>>({} as Record<TokenSymbol, string>);
  const [balancesLoading, setBalancesLoading] = useState(false);

  // Derive Starknet wallet address from Privy
  const starknetWallet = wallets.find((w: any) => w.chainType === 'starknet');
  const walletAddress = starknetWallet?.address ?? null;

  // Store Privy auth token for API calls
  useEffect(() => {
    if (authenticated) {
      getAccessToken().then((token) => {
        if (token) sessionStorage.setItem('privy:token', token);
      });
    } else {
      sessionStorage.removeItem('privy:token');
    }
  }, [authenticated, getAccessToken]);

  // Init Starkzap SDK when wallet is ready
  useEffect(() => {
    if (authenticated && starknetWallet) {
      getStarkZap(starknetWallet);
    } else {
      resetStarkZap();
    }
  }, [authenticated, starknetWallet]);

  // Load profile from backend
  const refreshProfile = useCallback(async () => {
    if (!authenticated || !walletAddress) return;
    try {
      const p = await userApi.me().catch(() => null);
      setProfile(p);

      // Auto-register if not found
      if (!p && walletAddress) {
        const email = (user?.linkedAccounts as any[])?.find((a: any) => a.type === 'email')?.address;
        const registered = await userApi.register({ walletAddress, email }).catch(() => null);
        setProfile(registered);
      }
    } catch (err) {
      console.error('[WalletContext] Failed to load profile:', err);
    }
  }, [authenticated, walletAddress, user]);

  // Refresh balances from Starkzap SDK
  const refreshBalances = useCallback(async () => {
    if (!authenticated || !walletAddress) return;
    setBalancesLoading(true);
    try {
      const bal = await getAllBalances();
      setBalances(bal);
    } catch (err) {
      console.error('[WalletContext] Failed to load balances:', err);
    } finally {
      setBalancesLoading(false);
    }
  }, [authenticated, walletAddress]);

  // On auth change, refresh profile + balances
  useEffect(() => {
    if (authenticated && walletAddress) {
      refreshProfile();
      refreshBalances();
    } else {
      setProfile(null);
      setBalances({} as Record<TokenSymbol, string>);
    }
  }, [authenticated, walletAddress]);

  const handleLogout = useCallback(async () => {
    resetStarkZap();
    sessionStorage.removeItem('privy:token');
    await privyLogout();
  }, [privyLogout]);

  return (
    <WalletContext.Provider
      value={{
        isAuthenticated: authenticated,
        isLoading: !ready,
        walletAddress,
        privyUser: user,
        profile,
        refreshProfile,
        balances,
        refreshBalances,
        balancesLoading,
        login,
        logout: handleLogout,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}
