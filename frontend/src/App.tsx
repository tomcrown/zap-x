import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "./contexts/WalletContext.js";
import { ToastProvider } from "./contexts/ToastContext.js";
import { AuthLayout, PublicLayout } from "./components/layout/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ClaimPageContent } from "./components/claim/ClaimPage.js";
import { AIExecutor } from "./components/send/AIExecutor.js";
import { config } from "./config.js";
import { DocsPage } from "./pages/DocsPage.js";

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
          accentColor: "#22d3ee",
          logo: undefined,
        },
        loginMethods: ["email", "google"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <Routes>
                {/* Public routes */}
                <Route element={<PublicLayout />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/claim/:token" element={<ClaimPageContent />} />
                  <Route path="/docs" element={<DocsPage />} />
                </Route>

                {/* App shell — chat is the entire product */}
                <Route element={<AuthLayout />}>
                  <Route path="/" element={<AIExecutor />} />
                  {/* Legacy route redirects */}
                  <Route
                    path="/dashboard"
                    element={<Navigate to="/" replace />}
                  />
                  <Route path="/send" element={<Navigate to="/" replace />} />
                  <Route path="/lend" element={<Navigate to="/" replace />} />
                  <Route path="/swap" element={<Navigate to="/" replace />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
