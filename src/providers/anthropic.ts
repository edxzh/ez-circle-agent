import Anthropic from "@anthropic-ai/sdk";
import type { WalletService } from "../wallet/types.js";
import { buildWalletTools } from "../tools/walletTools.js";
import { AGENT_SYSTEM_PROMPT } from "./systemPrompt.js";

export interface AnthropicAgentOptions {
  apiKey?: string;
  model?: string;
}

/** One agent turn via the Anthropic SDK tool runner. */
export async function runAnthropicAgent(
  userMessage: string,
  wallet: WalletService,
  options: AnthropicAgentOptions = {},
): Promise<string> {
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});

  const finalMessage = await client.beta.messages.toolRunner({
    model: options.model ?? "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: AGENT_SYSTEM_PROMPT,
    tools: buildWalletTools(wallet),
    messages: [{ role: "user", content: userMessage }],
  });

  return finalMessage.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
