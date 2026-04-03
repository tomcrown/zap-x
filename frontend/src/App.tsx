import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "./contexts/WalletContext.js";
import { ToastProvider } from "./contexts/ToastContext.js";
import { AuthLayout, PublicLayout } from "./components/layout/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SendPage } from "./pages/SendPage.js";
import { LendingPage } from "./pages/LendingPage.js";
import { SwapPage } from "./pages/SwapPage.js";
import { ClaimPageContent } from "./components/claim/ClaimPage.js";
import { config } from "./config.js";

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
          theme: "dark",
          accentColor: "#7c3aed",
          logo: undefined,
        },
        loginMethods: ["email", "google", "twitter", "wallet"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
                  <Route path="/lend" element={<LendingPage />} />
                  <Route path="/swap" element={<SwapPage />} />
                </Route>

                {/* Redirects */}
                <Route
                  path="/"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route
                  path="*"
                  element={<Navigate to="/dashboard" replace />}
                />
              </Routes>
            </BrowserRouter>
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
