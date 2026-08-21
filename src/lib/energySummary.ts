import type { EnergyProducerData } from "../types";
import { getEnergyHistory } from "./energyHistory";

/**
 * Energy summary: aggregation of the on-chain EnergyProducer +
 * local snapshots. The main UI metric is ENERGY (kWh); SRC tokens are a
 * consequence (displayed as "accumulated energy").
 */

/** Nominal estimate: 1 SRC ≈ 0.44 kWh (demo/fallback while there is no data). */
export const FALLBACK_KWH_PER_SRC = 0.44;
/** Target daily production of a device (for the progress bar). */
export const TODAY_TARGET_KWH = 10;
/** "Low gas" (SOL) threshold — show the SOL warning below this. */
export const LOW_SOL_THRESHOLD = 0.005;

/** Current device power (last snapshot), W. */
export function getCurrentPowerW(deviceId: string): number {
  const history = getEnergyHistory(deviceId);
  return history.length > 0 ? history[history.length - 1].powerW : 0;
}

/**
 * Today's production (kWh): integral of the power snapshots over time.
 * Intervals longer than 2h are ignored (protection against "jumps" on gaps).
 */
export function getTodayKwh(deviceId: string): number {
  const history = getEnergyHistory(deviceId);
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const points = history.filter((p) => p.ts >= dayStart.getTime() && p.ts <= now);
  if (points.length === 0) return 0;

  const MAX_GAP_MS = 2 * 60 * 60 * 1000;
  let kwh = 0;
  let prev = points[0];
  for (const p of points.slice(1)) {
    const dt = p.ts - prev.ts;
    if (dt > 0 && dt <= MAX_GAP_MS) {
      kwh += (((prev.powerW + p.powerW) / 2) * dt) / 3_600_000 / 1000;
    }
    prev = p;
  }
  const lastDt = now - prev.ts;
  if (lastDt > 0 && lastDt <= MAX_GAP_MS) {
    kwh += (prev.powerW * lastDt) / 3_600_000 / 1000;
  }
  return kwh;
}

/** Device daily-goal progress: 0..1 (capped). */
export function todayProgress(deviceId: string, targetKwh = TODAY_TARGET_KWH): number {
  const kwh = getTodayKwh(deviceId);
  if (targetKwh <= 0 || kwh <= 0) return 0;
  return Math.min(1, kwh / targetKwh);
}

/** Total production of all devices (kWh): on-chain + local estimate. */
export function getTotalEnergyKwh(
  producers: Array<EnergyProducerData | null>,
  deviceIds: string[],
): number {
  let total = 0;
  for (const p of producers) {
    if (p) total += Number(p.energyWh) / 1000;
  }
  // For devices without an on-chain record, add the local "today" estimate.
  const localDevices = deviceIds.filter((_, i) => !producers[i]);
  for (const id of localDevices) total += getTodayKwh(id);
  return total;
}

/**
 * Derived "kWh per 1 SRC" rate: from real data when available,
 * otherwise the nominal fallback. Used to display SRC as energy.
 */
export function deriveKwhPerSrc(totalKwh: number, totalSrcRaw: bigint): number {
  const totalSrc = Number(totalSrcRaw) / 1_000_000_000; // atomic → SRC
  if (totalKwh > 0 && totalSrc > 0) return totalKwh / totalSrc;
  return FALLBACK_KWH_PER_SRC;
}
