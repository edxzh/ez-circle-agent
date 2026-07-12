import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

/**
 * Demo x402 client: calls the paid summarizer, automatically paying the
 * 0.002 USDC micropayment from a local EOA when it receives a 402.
 *
 * Usage:
 *   CLIENT_PRIVATE_KEY=0x... npm run demo:client
 * The key needs testnet USDC on the server's network (default base-sepolia).
 */
async function main(): Promise<void> {
  const privateKey = process.env.CLIENT_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("Set CLIENT_PRIVATE_KEY (0x-prefixed) to a funded testnet key.");
  }

  const apiUrl = process.env.API_URL || "http://localhost:3000";
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Paying from ${account.address}`);

  const fetchWithPay = wrapFetchWithPayment(fetch, account);

  const response = await fetchWithPay(`${apiUrl}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text:
        "Circle's x402 support lets any HTTP API charge per request in USDC. " +
        "A server answers unauthenticated calls with 402 Payment Required plus machine-readable " +
        "payment requirements; the client signs a payment authorization and retries with an " +
        "X-PAYMENT header; a facilitator verifies and settles it on-chain.",
      style: "one sentence",
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }

  console.log("Summary:", JSON.stringify(await response.json(), null, 2));

  const settlementHeader = response.headers.get("x-payment-response");
  if (settlementHeader) {
    console.log("Settlement:", decodeXPaymentResponse(settlementHeader));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
