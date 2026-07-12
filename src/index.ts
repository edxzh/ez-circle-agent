import "dotenv/config";
import readline from "node:readline/promises";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { loadConfig } from "./config.js";
import { CircleWalletService } from "./wallet/circleWallet.js";
import { runAgent } from "./agent.js";

const ENTITY_SECRET_RE = /^[0-9a-fA-F]{64}$/;

/** Writes CIRCLE_ENTITY_SECRET into .env (replacing any existing line). */
function persistEntitySecret(secret: string): void {
  const envPath = path.join(process.cwd(), ".env");
  const line = `CIRCLE_ENTITY_SECRET=${secret}`;
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const updated = /^CIRCLE_ENTITY_SECRET=.*$/m.test(current)
    ? current.replace(/^CIRCLE_ENTITY_SECRET=.*$/m, line)
    : `${current.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, updated);
}

async function setup(): Promise<void> {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("Set CIRCLE_API_KEY in .env first.");

  let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!entitySecret || !ENTITY_SECRET_RE.test(entitySecret)) {
    // Missing or placeholder value — generate a fresh 32-byte hex secret
    // and save it straight into .env (never printed).
    entitySecret = randomBytes(32).toString("hex");
    persistEntitySecret(entitySecret);
    console.log("Generated a new entity secret and saved it to .env (CIRCLE_ENTITY_SECRET).");
  }

  try {
    await registerEntitySecretCiphertext({
      apiKey,
      entitySecret,
      recoveryFileDownloadPath: process.cwd(),
    });
    console.log(
      "Entity secret registered with Circle. Recovery file saved to the project directory — store it somewhere safe and do not commit it.",
    );
  } catch (err) {
    const detail = (err as { response?: { data?: unknown; status?: number } }).response;
    if (detail) {
      console.error(`Circle API error (HTTP ${detail.status}):`, JSON.stringify(detail.data, null, 2));
      const message = JSON.stringify(detail.data ?? "");
      if (/already|exist/i.test(message)) {
        console.error(
          "\nAn entity secret is already registered for this Circle entity. Reuse the original secret in .env, or reset it in the Circle Console (Configurator → Entity Secret).",
        );
        return;
      }
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "setup") {
    await setup();
    return;
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
  const model = config.aiProvider === "gemini" ? config.geminiModel : config.anthropicModel;
  console.log(`Agent wallet ready: ${info.address} on ${info.blockchain}`);
  console.log(`AI provider: ${config.aiProvider} (${model})\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Chat with your agent (e.g. "What is my balance?", "Send 1 USDC to 0x..."). Ctrl+C to exit.\n');

  for (;;) {
    const userMessage = (await rl.question("you> ")).trim();
    if (!userMessage) continue;
    try {
      const reply = await runAgent(userMessage, wallet, {
        provider: config.aiProvider,
        apiKey: config.aiProvider === "gemini" ? config.geminiApiKey : config.anthropicApiKey,
        model,
      });
      console.log(`\nagent> ${reply}\n`);
    } catch (err) {
      console.error(`\nerror> ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
