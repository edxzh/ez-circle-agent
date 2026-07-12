import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { RequestHandler } from "express";
import { createApp, PRICE_USD, SUMMARIZE_ROUTE } from "../src/server/app.js";
import type { Summarizer } from "../src/server/summarizer.js";

const PAY_TO = "0xAb5801a7D398351b8bE11C439e05C5b3259aeC9B" as const;

const stubSummarizer: Summarizer = {
  async summarize({ text }) {
    return {
      summary: `SUMMARY(${text.slice(0, 20)}...)`,
      model: "stub-model",
      inputTokens: 42,
      outputTokens: 7,
    };
  },
};

/** Minimal stand-in for the x402 gate: requires an X-PAYMENT header. */
const stubGate: RequestHandler = (req, res, next) => {
  if (req.path === SUMMARIZE_ROUTE && !req.header("X-PAYMENT")) {
    res.status(402).json({ x402Version: 1, error: "X-PAYMENT header is required", accepts: [] });
    return;
  }
  next();
};

function listen(app: import("express").Express): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe("x402 payment gate (real x402-express middleware)", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const app = createApp({
      payTo: PAY_TO,
      network: "base-sepolia",
      summarizer: stubSummarizer,
    });
    ({ server, url } = await listen(app));
  });

  afterAll(() => server.close());

  it("answers unpaid requests with 402 + machine-readable payment requirements", async () => {
    const res = await fetch(`${url}${SUMMARIZE_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: "hello world" }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.x402Version).toBeDefined();
    expect(Array.isArray(body.accepts)).toBe(true);

    const requirement = body.accepts[0];
    expect(requirement.payTo.toLowerCase()).toBe(PAY_TO.toLowerCase());
    expect(requirement.network).toBe("base-sepolia");
    // $0.002 in 6-decimal USDC base units = 2000
    expect(Number(requirement.maxAmountRequired)).toBe(2000);
  });

  it("leaves the health endpoint free", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });
});

describe("paid summarization path (stub gate)", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const app = createApp({
      payTo: PAY_TO,
      network: "base-sepolia",
      summarizer: stubSummarizer,
      gate: stubGate,
    });
    ({ server, url } = await listen(app));
  });

  afterAll(() => server.close());

  it("still 402s without payment", async () => {
    const res = await fetch(`${url}${SUMMARIZE_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(402);
  });

  it("returns the summary once payment is attached", async () => {
    const res = await fetch(`${url}${SUMMARIZE_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PAYMENT": "stub-payment-payload" },
      body: JSON.stringify({ text: "The quick brown fox jumps over the lazy dog." }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBe(PRICE_USD);
    expect(body.summary).toContain("SUMMARY(");
    expect(body.model).toBe("stub-model");
  });

  it("validates the request body after the paywall", async () => {
    const res = await fetch(`${url}${SUMMARIZE_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PAYMENT": "stub-payment-payload" },
      body: JSON.stringify({ text: "" }),
    });
    expect(res.status).toBe(400);
  });
});
