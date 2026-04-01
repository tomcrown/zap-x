import { TokenSymbol } from '../models/types.js';

/**
 * Token contract addresses on Starknet (mainnet & sepolia share same symbols,
 * addresses differ — use STARKNET_NETWORK env to switch).
 */
export const TOKEN_ADDRESSES: Record<TokenSymbol, Record<'mainnet' | 'sepolia', string>> = {
  STRK: {
    mainnet: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    sepolia: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  },
  ETH: {
    mainnet: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    sepolia: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  },
  USDC: {
    mainnet: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    sepolia: '0x005a643907b9a4bc6a55e9069c4fd5fd1f5c79a22470690f75556c4736e34426',
  },
  USDT: {
    mainnet: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    sepolia: '0x0498edfaf50ca5855666a700c25dd629d577eb9afccdf3b5977aec79aee55ada',
  },
  wBTC: {
    mainnet: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    sepolia: '0x0421e5b0b89b4d5d74a61a5f34db1ef26fc5d9fe7a2fd8e8ae60dd5c55e06cfe',
  },
  lBTC: {
    mainnet: '0x0000000000000000000000000000000000000000000000000000000000000000',
    sepolia: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  tBTC: {
    mainnet: '0x0000000000000000000000000000000000000000000000000000000000000000',
    sepolia: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
};

/** Token decimals */
export const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
  STRK: 18,
  ETH: 18,
  USDC: 6,
  USDT: 6,
  wBTC: 8,
  lBTC: 8,
  tBTC: 18,
};

/**
 * Parse a human-readable amount string to bigint base units.
 * e.g. "5.5" with 18 decimals → 5500000000000000000n
 */
export function parseAmount(amount: string, token: TokenSymbol): bigint {
  const decimals = TOKEN_DECIMALS[token];
  const [intPart, fracPart = ''] = amount.split('.');
  const frac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart + frac);
}

/**
 * Format a bigint base unit to human-readable string.
 */
export function formatAmount(raw: bigint, token: TokenSymbol): string {
  const decimals = TOKEN_DECIMALS[token];
  const str = raw.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const fracPart = str.slice(str.length - decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/**
 * Return expiry date — 7 days from now.
 */
export function claimExpiry(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

/**
 * Safely truncate a Starknet address for display.
 */
export function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Sanitise a username (strip @, lowercase, trim).
 */
export function normaliseUsername(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim();
}
