import { ENERGY_HISTORY_KEY_PREFIX, ENERGY_HISTORY_MAX_POINTS } from "../config";
import type { EnergyPoint } from "../types";

/**
 * Local energy-production history for a device.
 * The contract has no hourly series on-chain (only cumulative/monthly window),
 * so {ts, powerW} snapshots are written locally when pinging the device
 * (see ENERGY_POLL_INTERVAL_MS). On the first launch — demo data (24h),
 * so the chart is alive until the first real report.
 */

export function energyKey(deviceId: string): string {
  return `${ENERGY_HISTORY_KEY_PREFIX}${deviceId}`;
}

export function getEnergyHistory(deviceId: string): EnergyPoint[] {
  try {
    const raw = localStorage.getItem(energyKey(deviceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EnergyPoint[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return parsed
      .filter((p) => typeof p.ts === "number" && typeof p.powerW === "number")
      .filter((p) => p.ts >= cutoff)
      .sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

function persist(deviceId: string, points: EnergyPoint[]): EnergyPoint[] {
  const trimmed = points.slice(-ENERGY_HISTORY_MAX_POINTS);
  localStorage.setItem(energyKey(deviceId), JSON.stringify(trimmed));
  return trimmed;
}

export function appendEnergyPoint(deviceId: string, point: EnergyPoint): EnergyPoint[] {
  const history = getEnergyHistory(deviceId);
  history.push(point);
  return persist(deviceId, history);
}

/**
 * 24h demo data (sinusoidal generation, typical for a solar panel/inverter).
 * Created once, if the history is empty.
 */
export function ensureSeedData(deviceId: string): EnergyPoint[] {
  const existing = getEnergyHistory(deviceId);
  if (existing.length > 0) return existing;

  const now = Date.now();
  const points: EnergyPoint[] = [];
  const hours = 24;
  const stepMs = 15 * 60 * 1000; // 15 minutes
  const nowHour = new Date(now).getHours();

  // Start slightly inside the 24h window (23:45 ago) so every point passes
  // the getEnergyHistory filter (>= now - 24h).
  for (let i = hours * 4 - 1; i >= 0; i--) {
    const ts = now - i * stepMs;
    const hour = (nowHour - i / 4 + 24 * 10) % 24;
    // Solar curve: ~0 at night, peak around 12-14h.
    const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const noise = 0.85 + 0.3 * Math.sin(i * 1.7);
    const powerW = Math.round(daylight * 2400 * noise * 100) / 100;
    points.push({ ts, powerW: Math.max(0, powerW) });
  }
  return persist(deviceId, points);
}

export interface ChartPoint {
  label: string; // "14:00"
  kw: number; // kW, rounded
  powerW: number;
}

/** Hourly aggregation for the last 24h for Recharts. */
export function toHourlyChart(deviceId: string): ChartPoint[] {
  const points = getEnergyHistory(deviceId);
  if (points.length === 0) return [];

  const buckets = new Map<number, { sum: number; count: number; ts: number }>();
  for (const p of points) {
    const d = new Date(p.ts);
    d.setMinutes(0, 0, 0);
    const key = d.getTime();
    const b = buckets.get(key) ?? { sum: 0, count: 0, ts: key };
    b.sum += p.powerW;
    b.count += 1;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.ts - b.ts)
    .map((b) => {
      const d = new Date(b.ts);
      const label = `${String(d.getHours()).padStart(2, "0")}:00`;
      const powerW = Math.round(b.sum / b.count);
      return { label, kw: Math.round((powerW / 1000) * 100) / 100, powerW };
    });
}
