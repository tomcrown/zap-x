import React from "react";
import { useWallet } from "../../contexts/WalletContext.js";
import { Link } from "react-router-dom";

interface ChatHeaderProps {
  panelOpen: boolean;
  onTogglePanel: () => void;
}

export function ChatHeader({ panelOpen, onTogglePanel }: ChatHeaderProps) {
  const { profile, logout } = useWallet();

  return (
    <header className="h-14 border-b border-surface-border flex items-center justify-between px-4 sm:px-5 shrink-0 bg-surface z-10">
      {/* Left: panel toggle + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePanel}
          title={panelOpen ? "Close panel" : "Open panel"}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-surface-card transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {panelOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <svg
              width="200"
              height="200"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="200" height="200" rx="24" fill="#0B0B0B" />

              <path
                d="M50 60H150L50 140H150"
                stroke="#00E5FF"
                stroke-width="10"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <path
                d="M60 60L140 140M140 60L60 140"
                stroke="#00E5FF"
                stroke-width="6"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white tracking-tight hidden sm:block">
            Zap<span className="text-accent">-X</span>
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <Link
          to="/docs"
          className="hidden sm:block text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          docs
        </Link>
        {profile?.username && (
          <span className="hidden md:block text-xs text-zinc-600 font-mono">
            @{profile.username}
          </span>
        )}
        <button
          onClick={logout}
          className="text-xs text-zinc-700 hover:text-zinc-400 transition-colors font-mono"
        >
          disconnect
        </button>
      </div>
    </header>
  );
}

export { ChatHeader as Navbar };
