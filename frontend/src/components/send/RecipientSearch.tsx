import React, { useState, useEffect, useRef } from 'react';
import { userApi } from '../../lib/api.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onResolved?: (address: string | null) => void;
}

export function RecipientSearch({ value, onChange, onResolved }: Props) {
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<{ address: string; username?: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAddress = value.startsWith('0x');
  const isEmail = value.includes('@') && value.includes('.');

  useEffect(() => {
    setResolved(null);
    setNotFound(false);

    if (!value.trim() || isAddress) {
      onResolved?.(isAddress ? value : null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setResolving(true);
      try {
        const result = await userApi.lookup(value);
        if (result.found && result.walletAddress) {
          setResolved({ address: result.walletAddress, username: result.username ?? undefined });
          onResolved?.(result.walletAddress);
          setNotFound(false);
        } else {
          setResolved(null);
          setNotFound(!isEmail); // Email not found is OK (escrow flow)
          onResolved?.(null);
        }
      } catch {
        setResolved(null);
        onResolved?.(null);
      } finally {
        setResolving(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        Recipient
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="@username, email, or 0x address"
          className={`input pr-10 ${
            resolved ? 'border-green-500' :
            notFound ? 'border-red-500/60' : ''
          }`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {resolving && <LoadingSpinner size="sm" />}
          {resolved && !resolving && (
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Resolution hint */}
      {resolved && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-green-400">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Resolved to{' '}
          <span className="font-mono">{resolved.address.slice(0, 8)}…{resolved.address.slice(-6)}</span>
          {resolved.username && <span className="text-slate-500">(@{resolved.username})</span>}
        </div>
      )}

      {isEmail && !resolving && !resolved && value.length > 5 && (
        <p className="mt-1.5 text-xs text-yellow-400">
          📧 Email not registered — funds will be escrowed and a claim link emailed to them.
        </p>
      )}

      {notFound && !resolving && (
        <p className="mt-1.5 text-xs text-red-400">
          Username not found on Zap-X.
        </p>
      )}

      {isAddress && (
        <p className="mt-1.5 text-xs text-slate-500">
          Direct wallet address — will transfer immediately.
        </p>
      )}
    </div>
  );
}
