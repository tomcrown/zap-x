export type TokenSymbol = 'STRK' | 'ETH' | 'USDC' | 'USDT' | 'wBTC' | 'lBTC' | 'tBTC';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type ClaimStatus = 'pending' | 'claimed' | 'expired' | 'cancelled';
export type StakeStatus = 'active' | 'exiting' | 'withdrawn';
export interface SwapRecord {
  id: number;
  user_wallet: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  tx_hash: string;
  provider: string;
  created_at: string;
}

export type LendingStatus = 'active' | 'withdrawn';

export interface LendingPosition {
  id: number;
  user_wallet: string;
  token: string;
  supplied_amount: string;
  entry_tx_hash: string | null;
  status: LendingStatus;
  created_at: string;
  updated_at: string;
}

export interface LendingStats {
  totalSupplied: string;
  positions: LendingPosition[];
  projectedAnnualYield: string;
}
export type ActionType = 'send' | 'stake' | 'unstake' | 'swap' | 'save' | 'invest' | 'bridge' | 'dca' | 'borrow' | 'repay';

export interface Transaction {
  id: number;
  sender_wallet: string;
  recipient_wallet: string | null;
  recipient_identifier: string;
  amount: string;
  token: TokenSymbol;
  tx_hash: string | null;
  status: TransactionStatus;
  note: string | null;
  claim_link_id: number | null;
  created_at: string;
}

export interface ClaimLink {
  token: string;
  senderWallet: string;
  amount: string;
  tokenType: TokenSymbol;
  recipientEmail: string | null;
  recipientUsername: string | null;
  status: ClaimStatus;
  expiresAt: string;
  createdAt: string;
}

export interface StakingPosition {
  id: number;
  user_wallet: string;
  pool_address: string;
  pool_name: string;
  token: TokenSymbol;
  staked_amount: string;
  entry_tx_hash: string | null;
  exit_intent_tx_hash: string | null;
  status: StakeStatus;
  created_at: string;
  updated_at: string;
}

export interface StakingPool {
  address: string;
  name: string;
  token: TokenSymbol;
  apy: string;
}

export interface StakingStats {
  totalStaked: string;
  positions: StakingPosition[];
  pools: Record<string, { name: string; token: TokenSymbol; apy: string }>;
  projectedAnnualYield: string;
}

export interface UserProfile {
  id: number;
  username: string | null;
  email: string | null;
  walletAddress: string;
  createdAt: string;
}

export interface ParsedAction {
  type: ActionType;
  amount: string;
  token: TokenSymbol;
  recipient?: string;
  toToken?: string;
  pool?: string;
  note?: string;
  fromChain?: string;
  frequency?: string;
  collateralToken?: TokenSymbol;
  cycles?: number;
}

export interface AIParseResult {
  actions: ParsedAction[];
  original: string;
  confidence: number;
  clarification?: string;
}

export interface WalletBalance {
  token: TokenSymbol;
  amount: string;
  usdValue?: string;
}

export interface SendFormValues {
  recipient: string;
  amount: string;
  token: TokenSymbol;
  note: string;
  gasless: boolean;
}
