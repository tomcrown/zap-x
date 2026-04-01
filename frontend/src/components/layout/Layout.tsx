import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Navbar } from './Navbar.js';
import { Sidebar } from './Sidebar.js';
import { ToastContainer } from '../common/Toast.js';
import { useWallet } from '../../contexts/WalletContext.js';
import { FullPageLoader } from '../common/LoadingSpinner.js';

// Layout that requires authentication
export function AuthLayout() {
  const { isAuthenticated, isLoading } = useWallet();

  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="max-w-7xl mx-auto flex">
        <Sidebar />
        <main className="flex-1 min-w-0 p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

// Public layout (no sidebar)
export function PublicLayout() {
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main>
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}
