import "dotenv/config";

export interface AppConfig {
  circleApiKey: string;
  circleEntitySecret: string;
  circleWalletSetId?: string;
  circleWalletId?: string;
  blockchain: string;
  anthropicApiKey?: string;
  anthropicModel: string;
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
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  };
}
