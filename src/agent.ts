import Anthropic from "@anthropic-ai/sdk";
import type { WalletService } from "./wallet/types.js";
import { buildWalletTools } from "./tools/walletTools.js";
import { MAX_TRANSFER_USDC } from "./wallet/guardrail.js";

const SYSTEM_PROMPT = `You are a Web3-enabled autonomous assistant with your own Circle-powered USDC wallet on a testnet.

You can:
- Report your wallet address so people can send you funds.
- Check your USDC balance and explain your financial status in plain English.
- Make USDC transfers when the user asks.

Financial rules (enforced in code, not just here): no single transfer may exceed ${MAX_TRANSFER_USDC} USDC. If a transfer is rejected with "Spending limit exceeded", tell the user about the limit — never retry with split amounts to work around it. Always check your balance before transferring.`;

export interface AgentOptions {
  apiKey?: string;
  model?: string;
}

/**
 * Runs one agent turn: the model orchestrates the Circle wallet tools via
 * the SDK tool runner and returns its final plain-English answer.
 */
export async function runAgent(
  userMessage: string,
  wallet: WalletService,
  options: AgentOptions = {},
): Promise<string> {
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});

  const finalMessage = await client.beta.messages.toolRunner({
    model: options.model ?? "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    tools: buildWalletTools(wallet),
    messages: [{ role: "user", content: userMessage }],
  });

  return finalMessage.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
