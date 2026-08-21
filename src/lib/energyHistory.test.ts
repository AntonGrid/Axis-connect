import { describe, expect, it } from "vitest";
import {
  appendEnergyPoint,
  ensureSeedData,
  getEnergyHistory,
  toHourlyChart,
} from "../lib/energyHistory";

describe("energyHistory (local snapshots)", () => {
  it("append + read back", () => {
    const now = Date.now();
    appendEnergyPoint("devA", { ts: now, powerW: 1200 });
    appendEnergyPoint("devA", { ts: now + 1000, powerW: 1400 });
    const h = getEnergyHistory("devA");
    expect(h).toHaveLength(2);
    expect(h[1].powerW).toBe(1400);
  });

  it("filters out points older than 24h", () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    appendEnergyPoint("devB", { ts: old, powerW: 900 });
    appendEnergyPoint("devB", { ts: Date.now(), powerW: 1000 });
    const h = getEnergyHistory("devB");
    expect(h).toHaveLength(1);
  });

  it("seed generates 24h demo data once", () => {
    const seeded = ensureSeedData("devC");
    expect(seeded.length).toBeGreaterThan(0);
    const again = ensureSeedData("devC");
    expect(again.length).toBe(seeded.length); // not duplicated
  });

  it("toHourlyChart buckets by hour", () => {
    // Anchor at the middle of the current hour — both points are in one bucket.
    const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    const now = hourStart + 30 * 60 * 1000; // minute 30 of the current hour
    appendEnergyPoint("devD", { ts: now - 30 * 60 * 1000, powerW: 1000 });
    appendEnergyPoint("devD", { ts: now - 10 * 60 * 1000, powerW: 3000 });
    const chart = toHourlyChart("devD");
    expect(chart.length).toBeGreaterThan(0);
    const last = chart[chart.length - 1];
    expect(last.kw).toBe(2); // (1000+3000)/2 / 1000
  });
});
