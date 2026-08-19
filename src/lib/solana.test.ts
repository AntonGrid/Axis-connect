import { describe, expect, it } from "vitest";
import { formatAtomic } from "../lib/solana";

describe("formatAtomic (SRC, 9 decimals)", () => {
  it("whole numbers", () => {
    expect(formatAtomic(1_000_000_000n)).toBe("1");
    expect(formatAtomic(0n)).toBe("0");
  });

  it("fractional", () => {
    expect(formatAtomic(123_456_789_123n)).toBe("123.456789123");
    expect(formatAtomic(1n)).toBe("0.000000001");
  });

  it("trailing zeros trimmed", () => {
    expect(formatAtomic(1_500_000_000n)).toBe("1.5");
    expect(formatAtomic(2_000_000_000n)).toBe("2");
  });
});
