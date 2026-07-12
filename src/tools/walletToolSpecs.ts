import { z } from "zod";
import type { WalletService } from "../wallet/types.js";
import {
  InvalidTransferError,
  MAX_TRANSFER_USDC,
  SpendingLimitExceededError,
} from "../wallet/guardrail.js";

/**
 * Provider-neutral tool definitions for the agent's Circle wallet.
 * Each provider adapter (Anthropic, Gemini) renders these into its own
 * tool/function-calling format; the execute() logic — including the
 * guardrail handling — is shared so behavior is identical everywhere.
 */
export interface WalletToolSpec {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute(input: Record<string, unknown>): Promise<string>;
}

const transferInput = z.object({
  destination_address: z
    .string()
    .describe("Recipient EVM address, 0x-prefixed (e.g. 0xAb5801a7...)"),
  amount: z
    .string()
    .describe(
      `Amount of USDC to send as a decimal string, e.g. "1" or "2.50". Max ${MAX_TRANSFER_USDC}.`,
    ),
});

export function buildWalletToolSpecs(wallet: WalletService): WalletToolSpec[] {
  return [
    {
      name: "get_wallet_info",
      description:
        "Get the agent's own wallet details: wallet ID, on-chain address (share this to receive funds), and blockchain network.",
      inputSchema: z.object({}),
      execute: async () => JSON.stringify(await wallet.getWalletInfo()),
    },
    {
      name: "check_usdc_balance",
      description:
        "Check the agent wallet's current USDC balance. Call this before reporting financial status or making a transfer.",
      inputSchema: z.object({}),
      execute: async () => JSON.stringify(await wallet.getUsdcBalance()),
    },
    {
      name: "transfer_usdc",
      description:
        `Send USDC from the agent wallet to a destination address. ` +
        `A hard-coded security guardrail rejects any single transfer above ${MAX_TRANSFER_USDC} USDC — ` +
        `do not attempt larger amounts and do not split a larger request into multiple transfers to evade the limit.`,
      inputSchema: transferInput,
      execute: async (input) => {
        const parsed = transferInput.safeParse(input);
        if (!parsed.success) {
          return JSON.stringify({ status: "rejected", error: parsed.error.message });
        }
        try {
          const receipt = await wallet.transferUsdc(
            parsed.data.destination_address,
            parsed.data.amount,
          );
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
    },
  ];
}
