import { describe, expect, it } from "vitest";
import "dotenv/config";
import { CircleWalletService } from "../src/wallet/circleWallet.js";

/**
 * Live testnet verification of the full loop:
 *   Tool layer -> Circle API -> on-chain 1 USDC transfer.
 *
 * Opt-in only: set WALLET_TEST_MODE=live plus Circle credentials and
 * TEST_RECIPIENT_ADDRESS in .env. Skipped in CI / default `npm test`.
 */
const live =
  process.env.WALLET_TEST_MODE === "live" &&
  !!process.env.CIRCLE_API_KEY &&
  !!process.env.CIRCLE_ENTITY_SECRET &&
  !!process.env.TEST_RECIPIENT_ADDRESS;

describe.skipIf(!live)("live Circle testnet transfer", () => {
  it("transfers 1 USDC on testnet through the Circle API", async () => {
    const wallet = new CircleWalletService({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
      blockchain: process.env.CIRCLE_BLOCKCHAIN || "ARB-SEPOLIA",
      walletSetId: process.env.CIRCLE_WALLET_SET_ID || undefined,
      walletId: process.env.CIRCLE_WALLET_ID || undefined,
    });

    const receipt = await wallet.transferUsdc(process.env.TEST_RECIPIENT_ADDRESS!, "1");

    expect(receipt.transactionId).toBeTruthy();
    expect(["INITIATED", "QUEUED", "SENT", "CONFIRMED", "COMPLETE"]).toContain(receipt.state);
  }, 120_000);
});
