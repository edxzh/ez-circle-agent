import type { WalletService } from "./wallet/types.js";
import { runAnthropicAgent } from "./providers/anthropic.js";
import { runGeminiAgent } from "./providers/gemini.js";

export type AiProvider = "gemini" | "anthropic";

export interface AgentOptions {
  /** Which LLM drives the agent. Defaults to "gemini". */
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
}

/**
 * Runs one agent turn: the selected LLM orchestrates the Circle wallet
 * tools and returns its final plain-English answer. The wallet layer —
 * including the 5 USDC guardrail — is identical across providers.
 */
export async function runAgent(
  userMessage: string,
  wallet: WalletService,
  options: AgentOptions = {},
): Promise<string> {
  const provider = options.provider ?? "gemini";
  if (provider === "anthropic") {
    return runAnthropicAgent(userMessage, wallet, options);
  }
  return runGeminiAgent(userMessage, wallet, options);
}
