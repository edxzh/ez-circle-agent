import { describe, expect, it } from "vitest";
import { MockWalletService } from "../src/wallet/mockWallet.js";
import { buildWalletTools } from "../src/tools/walletTools.js";
import type { WalletService } from "../src/wallet/types.js";

const RECIPIENT = "0xAb5801a7D398351b8bE11C439e05C5b3259aeC9B";

/**
 * Simulates the agent invoking a tool by name with LLM-produced input —
 * exercising the same Tool → Guardrail → Wallet path the live agent uses.
 */
async function invokeTool(wallet: WalletService, name: string, input: object): Promise<any> {
  const tools = buildWalletTools(wallet);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  const result = await tool.run(input as never);
  return JSON.parse(result as string);
}

describe("agent transfer loop (Agent -> Tool -> Wallet -> on-chain)", () => {
  it("reports wallet info and balance", async () => {
    const wallet = new MockWalletService(10);

    const info = await invokeTool(wallet, "get_wallet_info", {});
    expect(info.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    const balance = await invokeTool(wallet, "check_usdc_balance", {});
    expect(balance.symbol).toBe("USDC");
    expect(Number(balance.amount)).toBe(10);
  });

  it("completes a 1 USDC transfer end to end", async () => {
    const wallet = new MockWalletService(10);

    const result = await invokeTool(wallet, "transfer_usdc", {
      destination_address: RECIPIENT,
      amount: "1",
    });

    expect(result.status).toBe("submitted");
    expect(result.transactionId).toMatch(/^mock-tx-/);
    expect(result.state).toBe("CONFIRMED");
    expect(result.destinationAddress).toBe(RECIPIENT);

    // Balance reflects the on-chain execution
    const balance = await invokeTool(wallet, "check_usdc_balance", {});
    expect(Number(balance.amount)).toBeCloseTo(9);
    expect(wallet.transfers).toHaveLength(1);
  });

  it("intercepts a 6 USDC transfer with 'Spending limit exceeded'", async () => {
    const wallet = new MockWalletService(100);

    const result = await invokeTool(wallet, "transfer_usdc", {
      destination_address: RECIPIENT,
      amount: "6",
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toBe("Spending limit exceeded");

    // Nothing left the wallet
    const balance = await invokeTool(wallet, "check_usdc_balance", {});
    expect(Number(balance.amount)).toBe(100);
    expect(wallet.transfers).toHaveLength(0);
  });

  it("rejects transfers exceeding the wallet balance", async () => {
    const wallet = new MockWalletService(0.5);

    await expect(
      invokeTool(wallet, "transfer_usdc", { destination_address: RECIPIENT, amount: "1" }),
    ).rejects.toThrow(/Insufficient balance/);
  });
});
