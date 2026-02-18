import { describe, expect, it } from "vitest";
import { DevaError, formatErrorForTool } from "../src/errors.js";

describe("formatErrorForTool", () => {
  it("returns structured x402 challenge payload", () => {
    const text = formatErrorForTool(
      new DevaError({
        status: 402,
        code: "PAYMENT_REQUIRED",
        message: "Payment required",
        paymentChallenge: {
          scheme: "x402",
          network: "base",
          amount: "0.10",
          pay_to: "0xfeed"
        }
      })
    );

    const parsed = JSON.parse(text) as {
      error: string;
      message: string;
      payment_challenge: { scheme: string; network: string; amount: string; pay_to: string };
    };

    expect(parsed.error).toBe("PAYMENT_REQUIRED");
    expect(parsed.message).toBe("Payment required");
    expect(parsed.payment_challenge.scheme).toBe("x402");
    expect(parsed.payment_challenge.network).toBe("base");
    expect(parsed.payment_challenge.amount).toBe("0.10");
    expect(parsed.payment_challenge.pay_to).toBe("0xfeed");
  });
});
