import { PublicKey } from "@solana/web3.js";
import { DEVICE_SIGNER_PORT, DEVICE_SIGNER_TIMEOUT_MS } from "../config";
import { bytesToHex, hexToBytes } from "./encoding";
import { deviceIdShort, toDeviceIdHex } from "./qr";

/**
 * Клиент локального HTTP-signer'а прошивки ESP32 (модернизация Phase 3).
 *
 * Протокол (документируется в firmware/esp32_proof_sender/README.md):
 *   GET  /info        → { "deviceId": "0x…", "schema": "axis-energy-v1", "firmware": "…" }
 *   POST /sign        → body { "hex": "<message hex>" }
 *                       → { "signature": "<0x-hex 64 bytes>" }
 * Устройство подписывает ТОЛЬКО domain-separated сообщения (register/claim/rotate),
 * произвольные сообщения отклоняются (закрывает аудит-замечание P2 о команде SIGN).
 *
 * ⚠️ mDNS-имя axis-device-<4hex>.local резолвится в современных браузерах (mDNS).
 * Для HTTPS-окружения прямой http:// к устройству может быть заблокирован
 * как mixed content — в этом случае укажите локальный IP устройства вручную.
 */

export interface DeviceSignerInfo {
  deviceId: string; // "0x" + hex
  schema: string;
  firmware?: string;
  name?: string;
}

/** mDNS-хост устройства: "axis-device-<last4hex>.local" (совпадает с прошивкой). */
export function deviceSignerHost(deviceId: PublicKey): string {
  return `axis-device-${deviceIdShort(deviceId).toLowerCase()}.local`;
}

/** Все имена хостов, которые прошивка может регистрировать (primary + legacy). */
export function deviceSignerHosts(deviceId: PublicKey): string[] {
  const short = deviceIdShort(deviceId).toLowerCase();
  return [`axis-device-${short}.local`, `axis-${short}.local`];
}

export function deviceSignerUrl(deviceId: PublicKey, path: string): string {
  return `http://${deviceSignerHost(deviceId)}:${DEVICE_SIGNER_PORT}${path}`;
}

export function deviceSignerUrlByIp(ip: string, path: string): string {
  const clean = ip.trim().replace(/^https?:\/\//, "").replace(/:\d+$/, "");
  return `http://${clean}:${DEVICE_SIGNER_PORT}${path}`;
}

interface FetchOpts extends RequestInit {
  timeoutMs?: number;
}

async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = DEVICE_SIGNER_TIMEOUT_MS, ...rest } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Пробует каждый mDNS-хост устройства, пока какой-то не ответит. */
async function tryHosts<T>(
  deviceId: PublicKey,
  fn: (host: string) => Promise<T>,
): Promise<T | null> {
  for (const host of deviceSignerHosts(deviceId)) {
    try {
      const result = await fn(host);
      if (result !== null && result !== undefined) return result;
    } catch {
      // пробуем следующий хост
    }
  }
  return null;
}

/** Пинг устройства по mDNS. Возвращает null, если устройство не найдено. */
export async function fetchDeviceSignerInfo(
  deviceId: PublicKey,
  timeoutMs?: number,
): Promise<DeviceSignerInfo | null> {
  return tryHosts(deviceId, async (host) => {
    const res = await fetchWithTimeout(
      `http://${host}:${DEVICE_SIGNER_PORT}/api/device/info`,
      { timeoutMs },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DeviceSignerInfo>;
    if (!data.deviceId) return null;
    return {
      deviceId: data.deviceId,
      schema: data.schema ?? "axis-energy-v1",
      firmware: data.firmware,
      name: data.name,
    };
  });
}

/** Запрос подписи у устройства (сервер подписывает только разрешённые домены). */
export async function requestDeviceSignature(
  deviceId: PublicKey,
  messageHex: string,
  timeoutMs = 5000,
): Promise<Uint8Array> {
  const result = await tryHosts(deviceId, async (host) => {
    const res = await fetchWithTimeout(
      `http://${host}:${DEVICE_SIGNER_PORT}/api/device/sign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: messageHex }),
        timeoutMs,
      },
    );
    if (!res.ok) {
      throw new Error(`Устройство ответило HTTP ${res.status}`);
    }
    const data = (await res.json()) as { signature?: string };
    if (typeof data.signature !== "string" || !data.signature) {
      throw new Error("Устройство не вернуло поле signature");
    }
    return hexToBytes(data.signature);
  });
  if (!result) throw new Error("Устройство не найдено по сети (mDNS) или не ответило на /sign");
  return result;
}

/** Удобная обёртка: hex-сообщение → hex-подпись. */
export async function requestDeviceSignatureForMessage(
  deviceId: PublicKey,
  message: Uint8Array,
  timeoutMs?: number,
): Promise<Uint8Array> {
  return requestDeviceSignature(deviceId, bytesToHex(message), timeoutMs);
}

/** Адаптер подписи к флоу регистрации — берёт подписи прямо с девайса по сети. */
export function createDeviceSignerProvider(deviceId: PublicKey): {
  signRegister: (message: Uint8Array) => Promise<Uint8Array>;
  signClaim: (message: Uint8Array) => Promise<Uint8Array>;
  label: string;
} {
  return {
    label: `mDNS ${deviceSignerHost(deviceId)}`,
    signRegister: (m) => requestDeviceSignatureForMessage(deviceId, m),
    signClaim: (m) => requestDeviceSignatureForMessage(deviceId, m),
  };
}

export { toDeviceIdHex };
