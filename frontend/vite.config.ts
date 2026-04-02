import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "util", "stream", "events", "process"],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
  define: {
    // Suppress Lit dev-mode warning (comes from @coinbase/wallet-sdk dep)
    "globalThis.litIsDevMode": false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      // Proxy Starknet RPC calls through the dev server to avoid CORS
      "/starknet-rpc": {
        target: "https://api.cartridge.gg",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/starknet-rpc/, "/x/starknet/sepolia"),
      },
      // Proxy AVNU paymaster to avoid CORS
      "/avnu-paymaster": {
        target: "https://sepolia.paymaster.avnu.fi",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/avnu-paymaster/, ""),
      },
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
  },
  optimizeDeps: {
    include: ["starknet", "starkzap", "buffer", "util"],
  },
});
