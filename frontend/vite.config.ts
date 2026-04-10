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
      "/starknet-rpc": {
        target: "https://api.cartridge.gg",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/starknet-rpc/, "/x/starknet/sepolia"),
      },
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
