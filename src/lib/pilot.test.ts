import { describe, expect, it } from "vitest";
import { assessProofs, decodeMintReport } from "./pilot";
import { base58Encode } from "./encoding";

describe("pilot", () => {
  it("decodes a mint_energy OracleReport (232 bytes)", () => {
    const raw = new Uint8Array(232);
    // oracle (8..40) placeholder
    // device_id (40..72) — the pilot ESP32
    const device = new Uint8Array(
      Buffer.from(
        "cbec5afc382549012faf845ab25f593fe8f119d2ceb93f34ed308c283521584a",
        "hex",
      ),
    );
    raw.set(device, 40);
    const dv = new DataView(raw.buffer);
    dv.setBigUint64(72, 42n, true); // nonce
    dv.setBigInt64(80, 1_700_000_000n, true); // device_timestamp
    dv.setBigInt64(88, 1_700_000_060n, true); // verified_at
    dv.setBigUint64(96, 1n, true); // energy_wh

    const rep = decodeMintReport(base58Encode(raw));
    expect(rep).not.toBeNull();
    expect(rep?.deviceId).toBe(
      "cbec5afc382549012faf845ab25f593fe8f119d2ceb93f34ed308c283521584a",
    );
    expect(rep?.nonce).toBe(42);
    expect(rep?.energyWh).toBe(1);
    expect(rep?.timestamp).toBe(1_700_000_000);
  });

  it("returns null for malformed payloads", () => {
    expect(decodeMintReport("")).toBeNull();
    expect(decodeMintReport("1111")).toBeNull();
  });

  it("flags constant energy and computes a plausible score", () => {
    const base = 1_700_000_000;
    const history = Array.from({ length: 10 }, (_, i) => ({
      deviceId: "x",
      timestamp: base + i * 60,
      verifiedAt: base + i * 60 + 5,
      energyWh: 1,
      nonce: i,
      oracle: "oracle",
      signature: `sig${i}`,
    }));
    const h = assessProofs(history);
    expect(h.flags).toContain("constant_energy");
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(1);
    expect(h.metrics.nProofs).toBe(10);
    expect(h.metrics.avgIntervalSec).toBeCloseTo(60, 0);
  });

  it("flags night production", () => {
    const nightTs = new Date("2026-01-01T03:00:00Z").getTime() / 1000;
    const history = Array.from({ length: 6 }, (_, i) => ({
      deviceId: "x",
      timestamp: nightTs + i * 60,
      verifiedAt: nightTs + i * 60,
      energyWh: 1,
      nonce: i,
      oracle: "oracle",
      signature: `sig${i}`,
    }));
    const h = assessProofs(history);
    expect(h.flags).toContain("night_production");
  });
});
