# ez-circle-agent

A Web3-enabled AI agent (TypeScript / Node.js ESM) with an autonomous **Agent Wallet** powered by [Circle Developer-Controlled Wallets](https://developers.circle.com/w3s/docs). The agent can report its wallet address to receive funds, check its USDC balance, and make autonomous on-chain USDC transfers — inside a hardcoded security guardrail.

## Architecture

```
src/
├── index.ts              CLI entry (interactive chat + `setup` command)
├── agent.ts              LLM orchestration (Anthropic tool runner, claude-opus-4-8)
├── config.ts             .env loading & validation
├── tools/walletTools.ts  LLM tool definitions (thin adapters over the wallet layer)
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
3. Set `ANTHROPIC_API_KEY`.
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

## x402 readiness

The `WalletService` abstraction and structured `TransferReceipt` are designed so an HTTP x402 nanopayment handler can be layered on: on a `402 Payment Required` response, parse the payment header, call `transferUsdc()` (guardrail still applies), and retry with the payment proof.
