/**
 * Hardcoded security guardrail for autonomous transfers.
 *
 * This limit is intentionally a compile-time constant — not an env var and
 * not part of the LLM prompt — so neither configuration drift nor a
 * prompt-injected model can raise it.
 */
export const MAX_TRANSFER_USDC = 5;

export class SpendingLimitExceededError extends Error {
  constructor(public readonly requestedAmount: number) {
    super(
      `Spending limit exceeded: requested ${requestedAmount} USDC, but the maximum allowed per transaction is ${MAX_TRANSFER_USDC} USDC.`,
    );
    this.name = "SpendingLimitExceededError";
  }
}

export class InvalidTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransferError";
  }
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validates a requested transfer and enforces the 5 USDC hard cap.
 * Throws SpendingLimitExceededError / InvalidTransferError on violation;
 * returns the normalized numeric amount on success.
 */
export function assertTransferAllowed(destinationAddress: string, amount: string): number {
  if (!EVM_ADDRESS_RE.test(destinationAddress)) {
    throw new InvalidTransferError(
      `Invalid destination address "${destinationAddress}". Expected a 0x-prefixed 40-hex-char EVM address.`,
    );
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidTransferError(
      `Invalid transfer amount "${amount}". Expected a positive decimal number of USDC.`,
    );
  }

  if (parsed > MAX_TRANSFER_USDC) {
    throw new SpendingLimitExceededError(parsed);
  }

  return parsed;
}
