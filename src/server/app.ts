import express, { type Express, type RequestHandler } from "express";
import { paymentMiddleware, type Network } from "x402-express";
import type { Summarizer } from "./summarizer.js";

/**
 * Price of one summarization call. x402 middleware converts this dollar
 * amount to USDC base units on the configured network — 0.002 USDC.
 */
export const PRICE_USD = "$0.002";
export const SUMMARIZE_ROUTE = "/summarize";
export const MAX_INPUT_CHARS = 50_000;

export interface PaidApiOptions {
  /** Address that receives the USDC micropayments (the agent's Circle wallet). */
  payTo: `0x${string}`;
  /** x402 settlement network, e.g. "base-sepolia". */
  network: Network;
  summarizer: Summarizer;
  /**
   * Optional x402 facilitator (verification/settlement service), e.g. the
   * Circle Gateway facilitator endpoint. Defaults to the public testnet
   * facilitator at x402.org.
   */
  facilitatorUrl?: string;
  /** Test seam: replaces the x402 payment gate. */
  gate?: RequestHandler;
}

/** Builds the Express app for the x402-gated summarization API. */
export function createApp(options: PaidApiOptions): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Free, unauthenticated health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "ez-circle-agent paid summarizer" });
  });

  // x402 payment gate: every request to /summarize must carry a valid
  // X-PAYMENT header worth 0.002 USDC, otherwise it's answered with
  // 402 Payment Required + the payment requirements.
  const gate =
    options.gate ??
    paymentMiddleware(
      options.payTo,
      {
        [`POST ${SUMMARIZE_ROUTE}`]: {
          price: PRICE_USD,
          network: options.network,
          config: {
            description: "Premium AI text summarization (per request)",
            mimeType: "application/json",
          },
        },
      },
      options.facilitatorUrl
        ? { url: options.facilitatorUrl as `${string}://${string}` }
        : undefined,
    );
  app.use(gate);

  app.post(SUMMARIZE_ROUTE, (req, res) => {
    void (async () => {
      const { text, style } = (req.body ?? {}) as { text?: unknown; style?: unknown };

      if (typeof text !== "string" || text.trim().length === 0) {
        res.status(400).json({ error: "Body must be JSON with a non-empty 'text' string." });
        return;
      }
      if (text.length > MAX_INPUT_CHARS) {
        res.status(413).json({ error: `'text' exceeds ${MAX_INPUT_CHARS} characters.` });
        return;
      }
      if (style !== undefined && typeof style !== "string") {
        res.status(400).json({ error: "'style' must be a string when provided." });
        return;
      }

      try {
        const result = await options.summarizer.summarize({ text, style });
        res.json({ price: PRICE_USD, ...result });
      } catch (err) {
        console.error("summarization failed:", err);
        res.status(502).json({ error: "Summarization failed upstream." });
      }
    })();
  });

  return app;
}
