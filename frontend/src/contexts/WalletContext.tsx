import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  connectPrivyWallet,
  resetStarkZap,
  getAllBalances,
  getOrInitTongoConfidential,
} from "../lib/starkzap.js";
import { userApi, walletApi, registerTokenGetter } from "../lib/api.js";
import { UserProfile, TokenSymbol } from "../types/index.js";

interface WalletContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  privyUser: ReturnType<typeof usePrivy>["user"];

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
  const {
    authenticated,
    user,
    login,
    logout: privyLogout,
    ready,
    getAccessToken,
  } = usePrivy();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balances, setBalances] = useState<Record<TokenSymbol, string>>(
    {} as Record<TokenSymbol, string>,
  );
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const connectingRef = useRef(false);

  useEffect(() => {
    registerTokenGetter(getAccessToken);
  }, [getAccessToken]);

  useEffect(() => {
    if (!authenticated) {
      resetStarkZap();
      connectingRef.current = false;
      setWalletAddress(null);
      setIsSdkReady(false);
      return;
    }

    const cacheKey = `zap:wallet:${user?.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) setWalletAddress(cached);

    if (connectingRef.current) return;
    connectingRef.current = true;

    if (!cached) setIsWalletConnecting(true);

    getAccessToken()
      .then((token) => {
        if (token) sessionStorage.setItem("privy:token", token);
      })
      .catch(() => {});

    connectPrivyWallet(getAccessToken)
      .then((wallet) => {
        const addr = (wallet as any).address;
        setWalletAddress(addr);
        setIsSdkReady(true);
        localStorage.setItem(cacheKey, addr);
      })
      .catch(async (err) => {
        try {
          const info = await walletApi.ensureStarknetWallet();
          if (info?.address) {
            setWalletAddress(info.address);
            setIsSdkReady(true);
            localStorage.setItem(cacheKey, info.address);
          }
        } catch {}
      })
      .finally(() => {
        setIsWalletConnecting(false);
        connectingRef.current = false;
      });
  }, [authenticated, getAccessToken, user?.id]);

  const refreshProfile = useCallback(async () => {
    if (!authenticated || !walletAddress) return;
    try {
      const p = await userApi.me().catch(() => null);
      setProfile(p);

      if (!p && walletAddress) {
        const email = (user?.linkedAccounts as any[])?.find(
          (a: any) => a.type === "email",
        )?.address;
        const registered = await userApi
          .register({ walletAddress, email })
          .catch(() => null);
        setProfile(registered);
      }
    } catch (err) {}
  }, [authenticated, walletAddress, user]);

  const refreshBalances = useCallback(async () => {
    if (!authenticated || !walletAddress || !isSdkReady) return;
    setBalancesLoading(true);
    try {
      const bal = await getAllBalances();
      setBalances(bal);
    } catch (err) {
    } finally {
      setBalancesLoading(false);
    }
  }, [authenticated, walletAddress, isSdkReady]);

  useEffect(() => {
    if (authenticated && walletAddress) {
      refreshProfile();
    } else {
      setProfile(null);
    }
  }, [authenticated, walletAddress]);

  useEffect(() => {
    if (authenticated && walletAddress && isSdkReady) {
      refreshBalances();

      getOrInitTongoConfidential("STRK").catch(() => {});
    } else if (!authenticated) {
      setBalances({} as Record<TokenSymbol, string>);
    }
  }, [authenticated, walletAddress, isSdkReady]);

  const handleLogout = useCallback(async () => {
    resetStarkZap();
    setWalletAddress(null);
    sessionStorage.removeItem("privy:token");

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
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
