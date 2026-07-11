import { describe, expect, it } from "vitest";
import {
  assertTransferAllowed,
  InvalidTransferError,
  MAX_TRANSFER_USDC,
  SpendingLimitExceededError,
} from "../src/wallet/guardrail.js";

const ADDR = "0xAb5801a7D398351b8bE11C439e05C5b3259aeC9B";

describe("spending guardrail", () => {
  it("hard cap is 5 USDC", () => {
    expect(MAX_TRANSFER_USDC).toBe(5);
  });

  it("allows transfers up to and including the cap", () => {
    expect(assertTransferAllowed(ADDR, "1")).toBe(1);
    expect(assertTransferAllowed(ADDR, "4.99")).toBe(4.99);
    expect(assertTransferAllowed(ADDR, "5")).toBe(5);
  });

  it("rejects transfers above the cap with SpendingLimitExceededError", () => {
    expect(() => assertTransferAllowed(ADDR, "5.01")).toThrow(SpendingLimitExceededError);
    expect(() => assertTransferAllowed(ADDR, "100")).toThrow(/Spending limit exceeded/);
  });

  it("rejects malformed amounts", () => {
    for (const bad of ["0", "-1", "abc", "NaN", "Infinity", ""]) {
      expect(() => assertTransferAllowed(ADDR, bad)).toThrow(InvalidTransferError);
    }
  });

  it("rejects malformed destination addresses", () => {
    for (const bad of ["not-an-address", "0x123", "Ab5801a7D398351b8bE11C439e05C5b3259aeC9B"]) {
      expect(() => assertTransferAllowed(bad, "1")).toThrow(InvalidTransferError);
    }
  });
});
