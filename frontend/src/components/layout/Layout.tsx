import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { ChatHeader } from './Navbar.js';
import { SidePanel } from '../chat/SidePanel.js';
import { ToastContainer } from '../common/Toast.js';
import { useWallet } from '../../contexts/WalletContext.js';
import { FullPageLoader } from '../common/LoadingSpinner.js';

export function AuthLayout() {
  const { isAuthenticated, isLoading } = useWallet();
  const [panelOpen, setPanelOpen] = useState(false);

  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden">
      <ChatHeader
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />
      <div className="flex flex-1 overflow-hidden">
        <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
        <main className="flex-1 overflow-hidden min-w-0">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-surface">
      <Outlet />
      <ToastContainer />
    </div>
  );
}
