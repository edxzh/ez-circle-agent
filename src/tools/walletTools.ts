import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { WalletService } from "../wallet/types.js";
import { buildWalletToolSpecs } from "./walletToolSpecs.js";

/**
 * Renders the provider-neutral wallet tool specs as Anthropic SDK tools.
 * All validation and the 5 USDC guardrail live in the shared spec layer.
 */
export function buildWalletTools(wallet: WalletService) {
  return buildWalletToolSpecs(wallet).map((spec) =>
    betaZodTool({
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
      run: (input) => spec.execute(input),
    }),
  );
}
