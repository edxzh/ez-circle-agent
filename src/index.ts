import "dotenv/config";
import readline from "node:readline/promises";
import {
  generateEntitySecret,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";
import { loadConfig } from "./config.js";
import { CircleWalletService } from "./wallet/circleWallet.js";
import { runAgent } from "./agent.js";

async function setup(): Promise<void> {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("Set CIRCLE_API_KEY in .env first.");

  let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!entitySecret) {
    // generateEntitySecret prints the secret to stdout — copy it into .env
    generateEntitySecret();
    console.log("\nCopy the entity secret above into .env as CIRCLE_ENTITY_SECRET, then rerun `npm start -- setup` to register it.");
    return;
  }

  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: process.cwd(),
  });
  console.log("Entity secret registered with Circle. Recovery file saved to the project directory — store it somewhere safe and do not commit it.");
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
  console.log(`Agent wallet ready: ${info.address} on ${info.blockchain}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Chat with your agent (e.g. "What is my balance?", "Send 1 USDC to 0x..."). Ctrl+C to exit.\n');

  for (;;) {
    const userMessage = (await rl.question("you> ")).trim();
    if (!userMessage) continue;
    try {
      const reply = await runAgent(userMessage, wallet, {
        apiKey: config.anthropicApiKey,
        model: config.anthropicModel,
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
