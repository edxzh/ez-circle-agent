import { describe, expect, it } from "vitest";
import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { runGeminiAgent, toFunctionDeclaration, type GeminiClient } from "../src/providers/gemini.js";
import { buildWalletToolSpecs } from "../src/tools/walletToolSpecs.js";
import { MockWalletService } from "../src/wallet/mockWallet.js";

const RECIPIENT = "0xAb5801a7D398351b8bE11C439e05C5b3259aeC9B";

/** Scripted fake Gemini client: pops one canned response per call. */
function fakeClient(
  script: Array<(params: GenerateContentParameters) => Partial<GenerateContentResponse>>,
): GeminiClient & { requests: GenerateContentParameters[] } {
  const requests: GenerateContentParameters[] = [];
  return {
    requests,
    models: {
      async generateContent(params) {
        requests.push(params);
        const next = script.shift();
        if (!next) throw new Error("fake client script exhausted");
        return next(params) as GenerateContentResponse;
      },
    },
  };
}

describe("gemini function declarations", () => {
  it("converts wallet tool specs to Gemini declarations", () => {
    const specs = buildWalletToolSpecs(new MockWalletService());
    const declarations = specs.map(toFunctionDeclaration);

    const names = declarations.map((d) => d.name);
    expect(names).toEqual(["get_wallet_info", "check_usdc_balance", "transfer_usdc"]);

    // Parameterless tools omit the schema entirely
    expect(declarations[0].parametersJsonSchema).toBeUndefined();

    // transfer_usdc carries a clean JSON schema (no $schema key)
    const transferSchema = declarations[2].parametersJsonSchema as Record<string, unknown>;
    expect(transferSchema.$schema).toBeUndefined();
    expect(transferSchema.type).toBe("object");
    expect(Object.keys(transferSchema.properties as object)).toEqual([
      "destination_address",
      "amount",
    ]);
  });
});

describe("gemini agent loop", () => {
  it("executes tool calls and returns the final text", async () => {
    const wallet = new MockWalletService(10);
    const client = fakeClient([
      // Turn 1: model asks for the balance
      () => ({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name: "check_usdc_balance", args: {} } }],
            },
          },
        ],
        functionCalls: [{ name: "check_usdc_balance", args: {} }],
      }),
      // Turn 2: model answers using the tool result it received
      (params) => {
        const contents = params.contents as Array<{ role?: string; parts?: unknown[] }>;
        const lastTurn = contents[contents.length - 1];
        const part = (lastTurn.parts as Array<{ functionResponse?: { response?: { result?: string } } }>)[0];
        const result = JSON.parse(part.functionResponse!.response!.result!);
        return { text: `You hold ${result.amount} USDC.` };
      },
    ]);

    const answer = await runGeminiAgent("What's my balance?", wallet, { client });
    expect(answer).toBe("You hold 10.000000 USDC.");
    expect(client.requests).toHaveLength(2);

    // Function declarations were sent on every request
    const config = client.requests[0].config!;
    expect(config.tools?.[0]).toHaveProperty("functionDeclarations");
  });

  it("routes over-limit transfers through the shared guardrail", async () => {
    const wallet = new MockWalletService(100);
    let guardrailResult = "";

    const client = fakeClient([
      () => ({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "transfer_usdc",
                    args: { destination_address: RECIPIENT, amount: "6" },
                  },
                },
              ],
            },
          },
        ],
        functionCalls: [
          { name: "transfer_usdc", args: { destination_address: RECIPIENT, amount: "6" } },
        ],
      }),
      (params) => {
        const contents = params.contents as Array<{ parts?: unknown[] }>;
        const part = (contents[contents.length - 1].parts as Array<{
          functionResponse?: { response?: { result?: string } };
        }>)[0];
        guardrailResult = part.functionResponse!.response!.result!;
        return { text: "I can't send that much — transfers are capped at 5 USDC." };
      },
    ]);

    const answer = await runGeminiAgent(`Send 6 USDC to ${RECIPIENT}`, wallet, { client });

    expect(answer).toContain("capped at 5 USDC");
    const parsed = JSON.parse(guardrailResult);
    expect(parsed.status).toBe("rejected");
    expect(parsed.error).toBe("Spending limit exceeded");
    // Nothing left the wallet
    expect(wallet.transfers).toHaveLength(0);
  });

  it("throws after too many tool iterations", async () => {
    const wallet = new MockWalletService(10);
    const loopForever = () => ({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ functionCall: { name: "check_usdc_balance", args: {} } }],
          },
        },
      ],
      functionCalls: [{ name: "check_usdc_balance", args: {} }],
    });
    const client = fakeClient(Array.from({ length: 20 }, () => loopForever));

    await expect(runGeminiAgent("loop", wallet, { client })).rejects.toThrow(
      /tool iterations/,
    );
  });
});
