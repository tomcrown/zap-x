export type TokenSymbol =
  | "STRK"
  | "ETH"
  | "USDC"
  | "USDT"
  | "wBTC"
  | "lBTC"
  | "tBTC";

export type TransactionStatus = "pending" | "confirmed" | "failed";
export type ClaimStatus = "pending" | "claimed" | "expired" | "cancelled";
export type StakeStatus = "active" | "exiting" | "withdrawn";

export interface DbUser {
  id: number;
  username: string | null;
  email: string | null;
  wallet_address: string;
  privy_user_id: string | null;
  privy_wallet_id: string | null;
  privy_wallet_public_key: string | null;
  tongo_private_key: string | null;
  tongo_public_key_x: string | null;
  tongo_public_key_y: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTransaction {
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

export interface DbClaimLink {
  id: number;
  token: string;
  sender_wallet: string;
  recipient_email: string | null;
  recipient_username: string | null;
  amount: string;
  token_type: TokenSymbol;
  escrow_tx_hash: string | null;
  claim_tx_hash: string | null;
  status: ClaimStatus;
  expires_at: string;
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

export interface SendRequest {
  senderWallet: string;
  recipient: string;
  amount: string;
  token: TokenSymbol;
  note?: string;
  gasless?: boolean;
}

export interface SendResponse {
  success: boolean;
  txHash?: string;
  claimToken?: string;
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
  privyToken?: string;
}

export interface StakeRequest {
  userWallet: string;
  poolAddress: string;
  amount: string;
  token: TokenSymbol;
  txHash: string;
}

export interface UserProfile {
  id: number;
  username: string | null;
  email: string | null;
  walletAddress: string;
  createdAt: string;
}

export type ActionType =
  | "send"
  | "stake"
  | "unstake"
  | "swap"
  | "save"
  | "invest"
  | "bridge"
  | "dca"
  | "borrow"
  | "repay";

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
  private?: boolean;
}

export interface AIParseResult {
  actions: ParsedAction[];
  original: string;
  confidence: number;
  clarification?: string;
}

export interface DcaRecord {
  id: number;
  user_wallet: string;
  sell_token: string;
  buy_token: string;
  amount_per_cycle: string;
  frequency: string;
  order_address: string | null;
  tx_hash: string;
  status: "active" | "cancelled";
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

export interface ClaimEmailPayload {
  recipientEmail: string;
  senderAddress: string;
  amount: string;
  token: TokenSymbol;
  claimLink: string;
  expiresAt: string;
  note?: string;
}
