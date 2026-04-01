export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  starknetNetwork: (import.meta.env.VITE_STARKNET_NETWORK ?? 'sepolia') as 'mainnet' | 'sepolia',
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID ?? '',
  avnuApiKey: import.meta.env.VITE_AVNU_API_KEY ?? '',
  strkStakingPool:
    import.meta.env.VITE_STRK_STAKING_POOL ??
    '0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1',
};
