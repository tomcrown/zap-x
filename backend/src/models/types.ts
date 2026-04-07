// ─── Domain Types ─────────────────────────────────────────────────────────────

export type TokenSymbol = 'STRK' | 'ETH' | 'USDC' | 'USDT' | 'wBTC' | 'lBTC' | 'tBTC';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type ClaimStatus = 'pending' | 'claimed' | 'expired' | 'cancelled';
export type StakeStatus = 'active' | 'exiting' | 'withdrawn';

// ─── Database Row Types ────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  username: string | null;
  email: string | null;
  wallet_address: string;
  privy_user_id: string | null;
  privy_wallet_id: string | null;
  privy_wallet_public_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTransaction {
  id: number;
  sender_wallet: string;
  recipient_wallet: string | null;
  recipient_identifier: string; // username, email, or address as typed
  amount: string;
  token: TokenSymbol;
  tx_hash: string | null;
  status: TransactionStatus;
  note: string | null;
  claim_link_id: number | null;
  created_at: string;
}

export interface DbClaimLink {
  id: number;
  token: string;           // unique claim token (UUID)
  sender_wallet: string;
  recipient_email: string | null;
  recipient_username: string | null;
  amount: string;
  token_type: TokenSymbol;
  escrow_tx_hash: string | null; // tx hash of funds sent to escrow
  claim_tx_hash: string | null;  // tx hash of funds released to recipient
  status: ClaimStatus;
  expires_at: string;      // ISO datetime
  created_at: string;
}

export interface DbStakingPosition {
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

// ─── API Request / Response Types ─────────────────────────────────────────────

export interface SendRequest {
  senderWallet: string;
  recipient: string;        // username (@user), email, or 0x address
  amount: string;
  token: TokenSymbol;
  note?: string;
  gasless?: boolean;
}

export interface SendResponse {
  success: boolean;
  txHash?: string;
  claimToken?: string;      // Set when recipient has no wallet
  claimLink?: string;
  message: string;
}

export interface ClaimLinkDetails {
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

export interface RedeemClaimRequest {
  recipientWallet: string;
  privyToken?: string;     // Privy auth token to verify identity
}

export interface StakeRequest {
  userWallet: string;
  poolAddress: string;
  amount: string;
  token: TokenSymbol;
  txHash: string;           // Frontend has already executed the stake tx
}

export interface UserProfile {
  id: number;
  username: string | null;
  email: string | null;
  walletAddress: string;
  createdAt: string;
}

// ─── AI Parsing Types ──────────────────────────────────────────────────────────

export type ActionType = 'send' | 'stake' | 'unstake' | 'swap' | 'save' | 'invest' | 'bridge' | 'dca' | 'borrow' | 'repay';

export interface ParsedAction {
  type: ActionType;
  amount: string;
  token: TokenSymbol;
  recipient?: string;          // send: username, email, or address
  toToken?: string;            // swap / dca: target token
  pool?: string;               // stake/unstake
  note?: string;
  fromChain?: string;          // bridge: "ethereum"
  frequency?: string;          // dca: ISO 8601 duration e.g. "P1D", "P7D", "P1M"
  collateralToken?: TokenSymbol; // borrow/repay: collateral token
  cycles?: number;             // dca: number of cycles (optional)
}

export interface AIParseResult {
  actions: ParsedAction[];
  original: string;
  confidence: number;       // 0–1
  clarification?: string;   // If ambiguous
}

// ─── DCA / Bridge Record Types ─────────────────────────────────────────────────

export interface DcaRecord {
  id: number;
  user_wallet: string;
  sell_token: string;
  buy_token: string;
  amount_per_cycle: string;
  frequency: string;
  order_address: string | null;
  tx_hash: string;
  status: 'active' | 'cancelled';
  created_at: string;
}

export interface BridgeRecord {
  id: number;
  user_wallet: string;
  token: string;
  amount: string;
  from_chain: string;
  tx_hash: string;
  created_at: string;
}

// ─── Email Types ───────────────────────────────────────────────────────────────

export interface ClaimEmailPayload {
  recipientEmail: string;
  senderAddress: string;
  amount: string;
  token: TokenSymbol;
  claimLink: string;
  expiresAt: string;
  note?: string;
}
