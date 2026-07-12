import "dotenv/config";

export type AiProvider = "gemini" | "anthropic";

export interface AppConfig {
  circleApiKey: string;
  circleEntitySecret: string;
  circleWalletSetId?: string;
  circleWalletId?: string;
  blockchain: string;
  aiProvider: AiProvider;
  geminiApiKey?: string;
  geminiModel: string;
  anthropicApiKey?: string;
  anthropicModel: string;
}

export function resolveAiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  if (raw !== "gemini" && raw !== "anthropic") {
    throw new Error(`Unsupported AI_PROVIDER "${raw}". Use "gemini" or "anthropic".`);
  }
  return raw;
}

export function loadConfig(): AppConfig {
  const circleApiKey = process.env.CIRCLE_API_KEY;
  const circleEntitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!circleApiKey || !circleEntitySecret) {
    throw new Error(
      "Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET. Copy .env.example to .env and fill in your Circle credentials.",
    );
  }

  return {
    circleApiKey,
    circleEntitySecret,
    circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID || undefined,
    circleWalletId: process.env.CIRCLE_WALLET_ID || undefined,
    blockchain: process.env.CIRCLE_BLOCKCHAIN || "ARB-SEPOLIA",
    aiProvider: resolveAiProvider(),
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  };
}
