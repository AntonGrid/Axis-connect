import type { EnergyProducerData } from "../types";
import { getEnergyHistory } from "./energyHistory";

/**
 * Энергетическая сводка: агрегация из on-chain EnergyProducer +
 * локальных снапшотов. Главная метрика интерфейса — ЭНЕРГИЯ (кВт·ч),
 * токены SRC — следствие (отображаются как «накопленная энергия»).
 */

/** Номинальная оценка: 1 SRC ≈ 0.44 кВт·ч (демо/fallback, пока нет данных). */
export const FALLBACK_KWH_PER_SRC = 0.44;
/** Целевая дневная выработка устройства (для прогресс-бара). */
export const TODAY_TARGET_KWH = 10;
/** Порог «мало газа» (SOL), при котором показываем SOL-предупреждение. */
export const LOW_SOL_THRESHOLD = 0.005;

/** Текущая мощность устройства (последний снапшот), Вт. */
export function getCurrentPowerW(deviceId: string): number {
  const history = getEnergyHistory(deviceId);
  return history.length > 0 ? history[history.length - 1].powerW : 0;
}

/**
 * Выработка за сегодня (кВт·ч): интеграл снапшотов мощности по времени.
 * Интервалы длиннее 2ч не учитываются (защита от «скачков» при разрыве).
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

/** Прогресс дневной цели устройства: 0..1 (кап). */
export function todayProgress(deviceId: string, targetKwh = TODAY_TARGET_KWH): number {
  const kwh = getTodayKwh(deviceId);
  if (targetKwh <= 0 || kwh <= 0) return 0;
  return Math.min(1, kwh / targetKwh);
}

/** Суммарная выработка всех устройств (кВт·ч): on-chain + локальная оценка. */
export function getTotalEnergyKwh(
  producers: Array<EnergyProducerData | null>,
  deviceIds: string[],
): number {
  let total = 0;
  for (const p of producers) {
    if (p) total += Number(p.energyWh) / 1000;
  }
  // Для устройств без on-chain записи добавляем локальную оценку «за сегодня».
  const localDevices = deviceIds.filter((_, i) => !producers[i]);
  for (const id of localDevices) total += getTodayKwh(id);
  return total;
}

/**
 * Производная ставка «кВт·ч за 1 SRC»: из реальных данных, если доступны,
 * иначе — номинальный fallback. Используется для отображения SRC как энергии.
 */
export function deriveKwhPerSrc(totalKwh: number, totalSrcRaw: bigint): number {
  const totalSrc = Number(totalSrcRaw) / 1_000_000_000; // атомарные → SRC
  if (totalKwh > 0 && totalSrc > 0) return totalKwh / totalSrc;
  return FALLBACK_KWH_PER_SRC;
}
