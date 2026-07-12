import "dotenv/config";
import type { Network } from "x402-express";
import { loadConfig } from "../config.js";
import { CircleWalletService } from "../wallet/circleWallet.js";
import { AnthropicSummarizer } from "./summarizer.js";
import { createApp, PRICE_USD, SUMMARIZE_ROUTE } from "./app.js";

/**
 * Resolves the payout address for micropayments. Prefers an explicit
 * PAYMENT_RECEIVING_ADDRESS; otherwise uses the agent's own Circle wallet,
 * so every API call tops up the agent's on-chain balance.
 */
async function resolvePayTo(): Promise<`0x${string}`> {
  const explicit = process.env.PAYMENT_RECEIVING_ADDRESS;
  if (explicit) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(explicit)) {
      throw new Error(`PAYMENT_RECEIVING_ADDRESS "${explicit}" is not a valid EVM address`);
    }
    return explicit as `0x${string}`;
  }

  const config = loadConfig();
  const wallet = new CircleWalletService({
    apiKey: config.circleApiKey,
    entitySecret: config.circleEntitySecret,
    blockchain: config.blockchain,
    walletSetId: config.circleWalletSetId,
    walletId: config.circleWalletId,
  });
  const info = await wallet.init();
  return info.address as `0x${string}`;
}

async function main(): Promise<void> {
  const payTo = await resolvePayTo();
  const network = (process.env.X402_NETWORK || "base-sepolia") as Network;
  const facilitatorUrl = process.env.X402_FACILITATOR_URL || undefined;
  const port = Number(process.env.PORT || 3000);

  const app = createApp({
    payTo,
    network,
    facilitatorUrl,
    summarizer: new AnthropicSummarizer(
      process.env.ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    ),
  });

  app.listen(port, () => {
    console.log(`Paid summarizer listening on http://localhost:${port}`);
    console.log(`  POST ${SUMMARIZE_ROUTE}  — ${PRICE_USD} USDC per request (x402, ${network})`);
    console.log(`  payments settle to ${payTo}`);
    console.log(`  facilitator: ${facilitatorUrl ?? "default (x402.org testnet facilitator)"}`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
