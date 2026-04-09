/**
 * WalletContext
 *
 * Flow:
 *  1. User logs in with Privy (email/Google) — no crypto needed.
 *  2. connectPrivyWallet() is called automatically:
 *       - Backend creates/fetches a Privy-managed Starknet wallet.
 *       - Starkzap derives wallet.address from the publicKey (ArgentX v0.5.0).
 *  3. walletAddress is set — shown in navbar, used for transfers/staking.
 *  4. All signing goes through the backend /api/wallet/sign → Privy rawSign.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { connectPrivyWallet, resetStarkZap, getAllBalances, getOrInitTongoConfidential } from '../lib/starkzap.js';
import { userApi, walletApi, registerTokenGetter } from '../lib/api.js';
import { UserProfile, TokenSymbol } from '../types/index.js';

interface WalletContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  privyUser: ReturnType<typeof usePrivy>['user'];

  isWalletConnecting: boolean;

  profile: UserProfile | null;
  refreshProfile: () => Promise<void>;

  balances: Record<TokenSymbol, string>;
  refreshBalances: () => Promise<void>;
  balancesLoading: boolean;

  login: () => void;
  logout: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user, login, logout: privyLogout, ready, getAccessToken } = usePrivy();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balances, setBalances] = useState<Record<TokenSymbol, string>>({} as Record<TokenSymbol, string>);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const connectingRef = useRef(false);

  // Register Privy's getAccessToken so the API interceptor always gets a fresh JWT
  useEffect(() => {
    registerTokenGetter(getAccessToken);
  }, [getAccessToken]);

  // Auto-connect Starknet wallet after Privy login
  useEffect(() => {
    if (!authenticated) {
      resetStarkZap();
      connectingRef.current = false;
      setWalletAddress(null);
      setIsSdkReady(false);
      return;
    }

    // Restore cached address immediately so the navbar doesn't flash "No wallet" on refresh
    const cacheKey = `zap:wallet:${user?.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) setWalletAddress(cached);

    // Only run the full SDK onboard once per page load
    if (connectingRef.current) return;
    connectingRef.current = true;

    // Only show the connecting spinner if we have no cached address yet
    if (!cached) setIsWalletConnecting(true);

    // Store token first so the axios interceptor has it before any API calls
    getAccessToken()
      .then((token) => { if (token) sessionStorage.setItem('privy:token', token); })
      .catch(() => {});

    connectPrivyWallet(getAccessToken)
      .then((wallet) => {
        const addr = (wallet as any).address;
        setWalletAddress(addr);
        setIsSdkReady(true);
        localStorage.setItem(cacheKey, addr);
      })
      .catch(async (err) => {
        console.error('[WalletContext] Starknet wallet onboard failed:', err?.message ?? err);
        // Fallback: get address from backend (pre-computed from public key, no gas needed)
        try {
          const info = await walletApi.ensureStarknetWallet();
          if (info?.address) {
            setWalletAddress(info.address);
            localStorage.setItem(cacheKey, info.address);
          }
        } catch {
          // backend unreachable — keep cached address if available
        }
      })
      .finally(() => {
        setIsWalletConnecting(false);
        connectingRef.current = false;
      });
  }, [authenticated, getAccessToken, user?.id]);

  // Load profile from backend
  const refreshProfile = useCallback(async () => {
    if (!authenticated || !walletAddress) return;
    try {
      const p = await userApi.me().catch(() => null);
      setProfile(p);

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
    if (!authenticated || !walletAddress || !isSdkReady) return;
    setBalancesLoading(true);
    try {
      const bal = await getAllBalances();
      setBalances(bal);
    } catch (err) {
      console.error('[WalletContext] Failed to load balances:', err);
    } finally {
      setBalancesLoading(false);
    }
  }, [authenticated, walletAddress, isSdkReady]);

  // Refresh profile when wallet address known
  useEffect(() => {
    if (authenticated && walletAddress) {
      refreshProfile();
    } else {
      setProfile(null);
    }
  }, [authenticated, walletAddress]);

  // Refresh balances only when SDK is ready (wallet fully connected)
  useEffect(() => {
    if (authenticated && walletAddress && isSdkReady) {
      refreshBalances();
      // Silently initialise the Tongo key so this user can receive private transfers
      // from anyone — runs in background, never blocks the UI.
      getOrInitTongoConfidential('STRK').catch(() => {});
    } else if (!authenticated) {
      setBalances({} as Record<TokenSymbol, string>);
    }
  }, [authenticated, walletAddress, isSdkReady]);

  const handleLogout = useCallback(async () => {
    resetStarkZap();
    setWalletAddress(null);
    sessionStorage.removeItem('privy:token');
    // Do NOT clear the wallet cache — the address is permanent for this user ID.
    // Next login will restore it instantly from localStorage.
    await privyLogout();
  }, [privyLogout, user?.id]);

  return (
    <WalletContext.Provider
      value={{
        isAuthenticated: authenticated,
        isLoading: !ready,
        walletAddress,
        privyUser: user,
        isWalletConnecting,
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
