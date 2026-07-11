import { randomUUID } from "node:crypto";
import type { TokenBalance, TransferReceipt, WalletInfo, WalletService } from "./types.js";
import { assertTransferAllowed } from "./guardrail.js";

/**
 * In-memory wallet used by `npm test` (and local dev without Circle keys).
 * Mirrors CircleWalletService behavior — including the guardrail — so the
 * full Agent → Tool → Wallet → "on-chain" loop can be exercised offline.
 */
export class MockWalletService implements WalletService {
  private balance: number;
  readonly transfers: TransferReceipt[] = [];

  private readonly info: WalletInfo = {
    walletId: "mock-wallet-0001",
    address: "0xA9e1cE0E3232dbA9DA0C381BE1A9c503A34c8bB1",
    blockchain: "ARB-SEPOLIA",
  };

  constructor(initialUsdcBalance = 10) {
    this.balance = initialUsdcBalance;
  }

  async init(): Promise<WalletInfo> {
    return this.info;
  }

  async getWalletInfo(): Promise<WalletInfo> {
    return this.info;
  }

  async getUsdcBalance(): Promise<TokenBalance> {
    return { symbol: "USDC", amount: this.balance.toFixed(6), tokenId: "mock-usdc-token" };
  }

  async transferUsdc(destinationAddress: string, amount: string): Promise<TransferReceipt> {
    // Same hardcoded guardrail path as the live service.
    const parsed = assertTransferAllowed(destinationAddress, amount);

    if (parsed > this.balance) {
      throw new Error(
        `Insufficient balance: wallet holds ${this.balance.toFixed(6)} USDC, requested ${amount} USDC.`,
      );
    }

    this.balance -= parsed;
    const receipt: TransferReceipt = {
      transactionId: `mock-tx-${randomUUID()}`,
      state: "CONFIRMED",
      amount,
      destinationAddress,
    };
    this.transfers.push(receipt);
    return receipt;
  }
}
