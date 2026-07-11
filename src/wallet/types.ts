export interface WalletInfo {
  walletId: string;
  address: string;
  blockchain: string;
}

export interface TokenBalance {
  symbol: string;
  amount: string;
  tokenId?: string;
}

export interface TransferReceipt {
  transactionId: string;
  state: string;
  amount: string;
  destinationAddress: string;
}

/**
 * Abstraction over the agent's on-chain wallet. Implemented by
 * CircleWalletService (live testnet) and MockWalletService (tests).
 */
export interface WalletService {
  /** Provision or connect the agent wallet. Idempotent. */
  init(): Promise<WalletInfo>;
  getWalletInfo(): Promise<WalletInfo>;
  getUsdcBalance(): Promise<TokenBalance>;
  /**
   * Transfer USDC to a destination address. Implementations MUST route
   * through the spending guardrail before touching the chain.
   */
  transferUsdc(destinationAddress: string, amount: string): Promise<TransferReceipt>;
}
