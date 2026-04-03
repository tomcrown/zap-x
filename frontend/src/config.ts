export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  starknetNetwork: (import.meta.env.VITE_STARKNET_NETWORK ?? 'sepolia') as 'mainnet' | 'sepolia',
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID ?? '',
  avnuApiKey: import.meta.env.VITE_AVNU_API_KEY ?? '',
  // Validator staker address (not the staking contract) — from sepoliaValidators in starkzap SDK
  strkStakingPool:
    import.meta.env.VITE_STRK_STAKING_POOL ??
    '0x003bc84d802c8a57cbe4eb4a6afa9b1255e907cba9377b446d6f4edf069403c5',
};
