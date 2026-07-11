import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { WalletService } from "../wallet/types.js";
import {
  InvalidTransferError,
  MAX_TRANSFER_USDC,
  SpendingLimitExceededError,
} from "../wallet/guardrail.js";

/**
 * Builds the Circle financial tools exposed to the LLM. The tools are thin
 * adapters — all validation and the 5 USDC guardrail live in the wallet
 * layer, so the model can never bypass them.
 */
export function buildWalletTools(wallet: WalletService) {
  const getWalletInfo = betaZodTool({
    name: "get_wallet_info",
    description:
      "Get the agent's own wallet details: wallet ID, on-chain address (share this to receive funds), and blockchain network.",
    inputSchema: z.object({}),
    run: async () => {
      const info = await wallet.getWalletInfo();
      return JSON.stringify(info);
    },
  });

  const checkBalance = betaZodTool({
    name: "check_usdc_balance",
    description:
      "Check the agent wallet's current USDC balance. Call this before reporting financial status or making a transfer.",
    inputSchema: z.object({}),
    run: async () => {
      const balance = await wallet.getUsdcBalance();
      return JSON.stringify(balance);
    },
  });

  const transferUsdc = betaZodTool({
    name: "transfer_usdc",
    description:
      `Send USDC from the agent wallet to a destination address. ` +
      `A hard-coded security guardrail rejects any single transfer above ${MAX_TRANSFER_USDC} USDC — ` +
      `do not attempt larger amounts and do not split a larger request into multiple transfers to evade the limit.`,
    inputSchema: z.object({
      destination_address: z
        .string()
        .describe("Recipient EVM address, 0x-prefixed (e.g. 0xAb5801a7...)"),
      amount: z
        .string()
        .describe(`Amount of USDC to send as a decimal string, e.g. "1" or "2.50". Max ${MAX_TRANSFER_USDC}.`),
    }),
    run: async ({ destination_address, amount }) => {
      try {
        const receipt = await wallet.transferUsdc(destination_address, amount);
        return JSON.stringify({ status: "submitted", ...receipt });
      } catch (err) {
        if (err instanceof SpendingLimitExceededError) {
          return JSON.stringify({
            status: "rejected",
            error: "Spending limit exceeded",
            detail: err.message,
          });
        }
        if (err instanceof InvalidTransferError) {
          return JSON.stringify({ status: "rejected", error: err.message });
        }
        throw err;
      }
    },
  });

  return [getWalletInfo, checkBalance, transferUsdc];
}
