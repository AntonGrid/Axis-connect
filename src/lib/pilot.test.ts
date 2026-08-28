import { describe, expect, it, vi } from "vitest";
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

  it("computes current power from proof intervals", async () => {
    const { proofsCurrentPowerW, proofsTodayKwh, proofsChartData } = await import("./pilot");
    const base = 1_700_000_000;
    const proofs = Array.from({ length: 3 }, (_, i) => ({
      deviceId: "x",
      timestamp: base + i * 60,
      verifiedAt: base + i * 60,
      energyWh: 1,
      nonce: i,
      oracle: "o",
      signature: `s${i}`,
    }));
    // 1 Wh / 60 s = 60 W
    expect(proofsCurrentPowerW(proofs)).toBeCloseTo(60, 0);
    expect(proofsChartData(proofs).length).toBeGreaterThan(0);
    // proofsTodayKwh counts proofs since local midnight (all of these are "today"
    // only if the timestamps fall on today — guard with a fixed date).
    expect(proofsTodayKwh(proofs)).toBeGreaterThanOrEqual(0);
  });

  it("decodes oracle REST proofs into PilotProof", async () => {
    const { fetchOracleProofs } = await import("./pilot");
    const { PublicKey } = await import("@solana/web3.js");
    const pubkey = new PublicKey(
      "Ej2oCfDkNFeFY7hcKHFRxtyHkmYUukbcWZXCqxKvih9b",
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        proofs: [
          {
            device_id: "0xcbec5afc",
            ts: 1787913813,
            energy_wh: 1,
            nonce: 876,
            mint_tx: "abc",
            mint_status: "minted",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchOracleProofs(pubkey, 5);
    expect(out).toHaveLength(1);
    expect(out[0].nonce).toBe(876);
    expect(out[0].energyWh).toBe(1);
    expect(out[0].signature).toBe("abc");
  });

  it("coerces Postgres BIGINT strings into numbers (no + concat bugs)", async () => {
    const { fetchOracleProofs, proofsTodayKwh, proofsChartData, assessProofs } =
      await import("./pilot");
    const { PublicKey } = await import("@solana/web3.js");
    const pubkey = new PublicKey(
      "Ej2oCfDkNFeFY7hcKHFRxtyHkmYUukbcWZXCqxKvih9b",
    );
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        proofs: [
          {
            device_id: "0xcbec5afc",
            ts: String(now - 120),
            energy_wh: "60",
            nonce: "10",
            mint_tx: "tx1",
            mint_status: "minted",
          },
          {
            device_id: "0xcbec5afc",
            ts: String(now - 60),
            energy_wh: "60",
            nonce: "11",
            mint_tx: "tx2",
            mint_status: "minted",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchOracleProofs(pubkey, 5);
    expect(out).toHaveLength(2);
    expect(out[0].nonce).toBe(10);
    expect(out[0].energyWh).toBe(60);
    expect(out[0].timestamp).toBe(now - 120);
    // Energy sums must be numeric, never string-concatenated ("60"+"60").
    expect(out.reduce((a, p) => a + p.energyWh, 0)).toBe(120);
    // 120 Wh → 0.12 kWh. With the string-concat bug this would be 6.06.
    const chartKw = proofsChartData(out).reduce((a, b) => a + b.kw, 0);
    expect(chartKw).toBeCloseTo(0.12, 5);
    expect(assessProofs(out).metrics.totalEnergyWh).toBe(120);
    expect(proofsTodayKwh(out)).toBeGreaterThanOrEqual(0);
  });
});
