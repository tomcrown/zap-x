import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),

  jwt: {
    secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
    expiresIn: '7d',
  },

  privy: {
    appId: optional('PRIVY_APP_ID', ''),
    appSecret: optional('PRIVY_APP_SECRET', ''),
    walletPublicKey: optional('PRIVY_WALLET_PUBLIC_KEY', ''),
    walletPrivateKey: optional('PRIVY_WALLET_PRIVATE_KEY', ''),
  },

  starknet: {
    network: optional('STARKNET_NETWORK', 'sepolia') as 'mainnet' | 'sepolia',
    rpcUrl: optional('STARKNET_RPC_URL', 'https://starknet-sepolia.public.blastapi.io/rpc/v0_7'),
  },

  escrow: {
    walletAddress: optional('ESCROW_WALLET_ADDRESS', ''),
    privateKey: optional('ESCROW_PRIVATE_KEY', ''),
  },

  avnu: {
    paymasterUrl: optional(
      'AVNU_PAYMASTER_URL',
      'https://sepolia.paymaster.avnu.fi'
    ),
    apiKey: optional('AVNU_API_KEY', ''),
  },

  staking: {
    strkPoolAddress: optional(
      'STRK_STAKING_POOL',
      '0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1'
    ),
  },

  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    model: optional('GEMINI_MODEL', 'gemini-1.5-flash'),
  },

  email: {
    host: optional('SMTP_HOST', 'smtp.gmail.com'),
    port: parseInt(optional('SMTP_PORT', '587'), 10),
    secure: optional('SMTP_SECURE', 'false') === 'true',
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('EMAIL_FROM', 'Zap-X <noreply@zapx.app>'),
  },

  db: {
    url: required('DATABASE_URL'),
  },
} as const;
