import {
  initiateDeveloperControlledWalletsClient,
  type CircleDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import type { TokenBalance, TransferReceipt, WalletInfo, WalletService } from "./types.js";
import { assertTransferAllowed } from "./guardrail.js";

export interface CircleWalletConfig {
  apiKey: string;
  entitySecret: string;
  blockchain: string;
  walletSetId?: string;
  walletId?: string;
}

/**
 * Live wallet service backed by Circle Developer-Controlled Wallets.
 * Provisions a wallet set + SCA wallet on first run if IDs are not supplied.
 */
export class CircleWalletService implements WalletService {
  private client: CircleDeveloperControlledWalletsClient;
  private walletInfo?: WalletInfo;

  constructor(private readonly config: CircleWalletConfig) {
    this.client = initiateDeveloperControlledWalletsClient({
      apiKey: config.apiKey,
      entitySecret: config.entitySecret,
    });
  }

  async init(): Promise<WalletInfo> {
    if (this.walletInfo) return this.walletInfo;

    // 1. Connect to an existing wallet if configured
    if (this.config.walletId) {
      const res = await this.client.getWallet({ id: this.config.walletId });
      const wallet = res.data?.wallet;
      if (!wallet) throw new Error(`Wallet ${this.config.walletId} not found`);
      this.walletInfo = {
        walletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
      };
      return this.walletInfo;
    }

    // 2. Otherwise provision: wallet set (if needed) → wallet
    let walletSetId = this.config.walletSetId;
    if (!walletSetId) {
      const res = await this.client.createWalletSet({ name: "ez-circle-agent" });
      walletSetId = res.data?.walletSet?.id;
      if (!walletSetId) throw new Error("Failed to create Circle wallet set");
      console.log(`Created wallet set ${walletSetId} — pin it via CIRCLE_WALLET_SET_ID`);
    }

    const res = await this.client.createWallets({
      walletSetId,
      count: 1,
      blockchains: [this.config.blockchain as never],
      accountType: "SCA",
    });
    const wallet = res.data?.wallets?.[0];
    if (!wallet) throw new Error("Failed to create Circle wallet");
    console.log(`Created wallet ${wallet.id} (${wallet.address}) — pin it via CIRCLE_WALLET_ID`);

    this.walletInfo = {
      walletId: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
    };
    return this.walletInfo;
  }

  async getWalletInfo(): Promise<WalletInfo> {
    return this.init();
  }

  async getUsdcBalance(): Promise<TokenBalance> {
    const { walletId } = await this.init();
    const res = await this.client.getWalletTokenBalance({ id: walletId });
    const balances = res.data?.tokenBalances ?? [];
    const usdc = balances.find((b) => b.token?.symbol?.toUpperCase().includes("USDC"));
    return {
      symbol: "USDC",
      amount: usdc?.amount ?? "0",
      tokenId: usdc?.token?.id,
    };
  }

  async transferUsdc(destinationAddress: string, amount: string): Promise<TransferReceipt> {
    // Hardcoded guardrail — enforced in code, before any network call.
    assertTransferAllowed(destinationAddress, amount);

    const { walletId } = await this.init();
    const balance = await this.getUsdcBalance();
    if (!balance.tokenId) {
      throw new Error(
        "The agent wallet holds no USDC on this network yet — fund it from a testnet faucet first.",
      );
    }
    if (Number(balance.amount) < Number(amount)) {
      throw new Error(
        `Insufficient balance: wallet holds ${balance.amount} USDC, requested ${amount} USDC.`,
      );
    }

    const res = await this.client.createTransaction({
      walletId,
      tokenId: balance.tokenId,
      destinationAddress,
      amount: [amount],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const tx = res.data;
    if (!tx?.id) throw new Error("Circle did not return a transaction id");

    return {
      transactionId: tx.id,
      state: tx.state ?? "INITIATED",
      amount,
      destinationAddress,
    };
  }
}
