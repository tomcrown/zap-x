/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_BACKEND_URL: string;
  readonly VITE_STARKNET_NETWORK: string;
  readonly VITE_STARKNET_RPC_URL: string;
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_AVNU_API_KEY: string;
  readonly VITE_AVNU_PAYMASTER_URL: string;
  readonly VITE_STRK_STAKING_POOL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
