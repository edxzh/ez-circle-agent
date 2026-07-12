# ez-circle-agent

A Web3-enabled AI agent (TypeScript / Node.js ESM) with an autonomous **Agent Wallet** powered by [Circle Developer-Controlled Wallets](https://developers.circle.com/w3s/docs). The agent can report its wallet address to receive funds, check its USDC balance, and make autonomous on-chain USDC transfers — inside a hardcoded security guardrail.

## Architecture

```
src/
├── index.ts              CLI entry (interactive chat + `setup` command)
├── agent.ts              Provider dispatch (Gemini by default, Anthropic switchable)
├── config.ts             .env loading & validation (AI_PROVIDER selection)
├── providers/
│   ├── systemPrompt.ts   Shared agent persona/rules
│   ├── gemini.ts         Google Gen AI function-calling loop + GeminiSummarizer
│   └── anthropic.ts      Anthropic tool-runner agent
├── tools/
│   ├── walletToolSpecs.ts Provider-neutral tool specs (zod schemas + guardrailed execute)
│   └── walletTools.ts     Anthropic adapter over the neutral specs
└── wallet/
    ├── types.ts          WalletService interface (AI layer never touches Circle directly)
    ├── guardrail.ts      ★ Hardcoded 5 USDC per-transaction cap + input validation
    ├── circleWallet.ts   Live Circle implementation (provisioning, balance, transfer)
    └── mockWallet.ts     In-memory implementation for tests / offline dev
tests/
├── guardrail.test.ts     Guardrail unit tests
├── transfer-loop.test.ts Full Agent→Tool→Wallet→"on-chain" loop (1 USDC transfer, mock)
└── live-transfer.test.ts Opt-in live 1 USDC testnet transfer via the Circle API
```

**Guardrail design:** the 5 USDC limit is a compile-time constant in `src/wallet/guardrail.ts`, enforced inside `transferUsdc()` before any network call. It is not configurable via env vars and not merely stated in the system prompt, so the LLM cannot be prompted around it. Violations return a structured `"Spending limit exceeded"` error into the agent's context.

## Setup

```bash
npm install
cp .env.example .env
```

1. Create a Circle API key at <https://console.circle.com> (testnet) and set `CIRCLE_API_KEY`.
2. Generate and register an entity secret:
   ```bash
   npm start -- setup        # prints a new entity secret → paste into .env
   npm start -- setup        # registers it with Circle (saves a recovery file)
   ```
3. Pick your LLM provider (both the chat CLI and the paid API honor it):
   - **Google (default):** set `GEMINI_API_KEY` (from [AI Studio](https://aistudio.google.com/apikey)). Model defaults to `gemini-2.5-flash`; override with `GEMINI_MODEL` (e.g. `gemini-3-flash` if available on your key).
   - **Anthropic:** set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. Model defaults to `claude-opus-4-8`.
4. Run the agent:
   ```bash
   npm start
   ```
   On first run it provisions a wallet set + SCA wallet and prints their IDs — pin them in `.env` (`CIRCLE_WALLET_SET_ID`, `CIRCLE_WALLET_ID`) to reuse the same wallet.
5. Fund the printed wallet address with testnet USDC (e.g. <https://faucet.circle.com>).

Example session:

```
you> What's your wallet address and how much money do you have?
agent> My wallet address is 0x… on ARB-SEPOLIA. I currently hold 10 USDC.

you> Send 6 USDC to 0xAb5801a7D398351b8bE11C439e05C5b3259aeC9B
agent> I can't — transfers are capped at 5 USDC per transaction by a hard guardrail.
```

## Testing

```bash
npm test
```

By default this runs offline: guardrail unit tests plus an integration test of the complete loop (agent tool → guardrail → wallet service → simulated on-chain execution), including a 1 USDC happy-path transfer and a rejected 6 USDC attempt.

To verify against the live Circle testnet (real 1 USDC transfer), set in `.env`:

```
WALLET_TEST_MODE=live
TEST_RECIPIENT_ADDRESS=0x...   # where the 1 USDC goes
```

then run `npm test` again — `tests/live-transfer.test.ts` un-skips itself.

## x402 Paid API — premium summarizer

The agent doubles as a **paid API**: an Express server that sells AI text summarization for **0.002 USDC per request** over the [x402 payment protocol](https://x402.org), with payouts settling to the agent's Circle wallet.

```
src/server/
├── index.ts       Server entry — resolves payout address (Circle wallet), starts Express
├── app.ts         x402 payment gate (0.002 USDC) + POST /summarize route
└── summarizer.ts  Anthropic-powered summarization (claude-opus-4-8)
src/client/payDemo.ts  Demo client that auto-pays 402s with x402-fetch + viem
```

**Flow:** a request without payment gets `402 Payment Required` plus machine-readable payment requirements (`payTo`, network, `maxAmountRequired: 2000` USDC base units). The client signs a USDC payment authorization, retries with an `X-PAYMENT` header, the facilitator verifies + settles it on-chain, and the summary is returned with an `X-PAYMENT-RESPONSE` settlement receipt.

```bash
npm run serve          # starts on :3000; payTo = agent's Circle wallet
                       # (or set PAYMENT_RECEIVING_ADDRESS to override)

# free endpoint
curl localhost:3000/health

# paywalled endpoint → 402 with payment requirements
curl -X POST localhost:3000/summarize -H 'Content-Type: application/json' -d '{"text":"..."}'

# paying client (needs a funded base-sepolia testnet key)
CLIENT_PRIVATE_KEY=0x... npm run demo:client
```

Configuration (`.env`): `X402_NETWORK` (default `base-sepolia`), `X402_FACILITATOR_URL` to point verification/settlement at Circle's x402 facilitator (defaults to the public x402.org testnet facilitator), `PAYMENT_RECEIVING_ADDRESS` to override the payout wallet.

`tests/paid-api.test.ts` covers the gate offline: the **real** x402 middleware answering unpaid requests with correct payment requirements (0.002 USDC → 2000 base units), the free health route, and the paid path returning summaries once payment is attached.
