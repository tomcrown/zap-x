import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletProvider } from './contexts/WalletContext.js';
import { ToastProvider } from './contexts/ToastContext.js';
import { AuthLayout, PublicLayout } from './components/layout/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { SendPage } from './pages/SendPage.js';
import { StakePage } from './pages/StakePage.js';
import { ClaimPageContent } from './components/claim/ClaimPage.js';
import { config } from './config.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <PrivyProvider
      appId={config.privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#7c3aed',
          logo: undefined,
        },
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
          // Enable Starknet embedded wallets
          starknet: {
            chains: [
              // Starknet Sepolia testnet
              {
                id: 393402133025997798597,
                name: 'Starknet Sepolia',
                rpcUrls: {
                  default: { http: [config.strkStakingPool.startsWith('0x0') ? 'https://starknet-sepolia.public.blastapi.io/rpc/v0_7' : ''] },
                },
              },
            ],
          },
        },
        defaultChain: {
          id: 393402133025997798597, // Starknet Sepolia chain ID
          name: 'Starknet Sepolia',
        } as any,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route element={<PublicLayout />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/claim/:token" element={<ClaimPageContent />} />
                </Route>

                {/* Protected routes */}
                <Route element={<AuthLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/send" element={<SendPage />} />
                  <Route path="/stake" element={<StakePage />} />
                </Route>

                {/* Redirects */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </BrowserRouter>
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
