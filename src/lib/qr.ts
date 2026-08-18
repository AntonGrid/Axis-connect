import { PublicKey } from "@solana/web3.js";
import { Html5Qrcode } from "html5-qrcode";
import { AXIS_ENERGY_SCHEMA } from "../types";
import type { QrScanResult } from "../types";
import { base58Decode, bytesToHex, hexToBytes } from "./encoding";

/**
 * Парсинг и валидация JSON из QR-кода устройства.
 * Ожидаемый формат (зафиксирован протоколом):
 *   { "deviceId": "PUBLIC_KEY", "schema": "axis-energy-v1" }
 */
export function parseDeviceQrPayload(raw: string): QrScanResult {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("QR не содержит валидный JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("QR: ожидается JSON-объект");
  }
  const { deviceId, schema } = payload as Record<string, unknown>;
  if (typeof deviceId !== "string" || deviceId.trim().length === 0) {
    throw new Error("QR: отсутствует поле deviceId");
  }
  if (schema !== AXIS_ENERGY_SCHEMA) {
    throw new Error(
      `QR: несовместимая schema "${String(schema)}" (ожидается "${AXIS_ENERGY_SCHEMA}")`,
    );
  }

  const pubkey = normalizeDeviceId(deviceId);
  return {
    raw,
    payload: { deviceId: deviceId.trim(), schema },
    deviceId: pubkey,
    deviceIdHex: toDeviceIdHex(pubkey),
  };
}

/**
 * Нормализация deviceId → Solana PublicKey.
 * Принимает base58 (32 байта) или "0x" + 64 hex.
 */
export function normalizeDeviceId(raw: string): PublicKey {
  const trimmed = raw.trim();
  let bytes: Uint8Array;

  if (/^0[xX][0-9a-fA-F]{64}$/.test(trimmed)) {
    bytes = hexToBytes(trimmed);
  } else {
    try {
      bytes = base58Decode(trimmed);
    } catch {
      throw new Error("deviceId: не base58 и не 0x-hex");
    }
  }
  if (bytes.length !== 32) {
    throw new Error(`deviceId: ожидается 32 байта, получено ${bytes.length}`);
  }
  return new PublicKey(bytes);
}

/** "0x" + 64 hex — канонический device_id прошивки ESP32. */
export function toDeviceIdHex(pubkey: PublicKey): string {
  return "0x" + bytesToHex(pubkey.toBytes());
}

/** Хвост device_id (последние 4 hex-символа) — для mDNS-имени "Axis-Device-XXXX". */
export function deviceIdShort(pubkey: PublicKey): string {
  return toDeviceIdHex(pubkey).replace(/^0x/, "").slice(-4).toUpperCase();
}

type ScanHandler = (result: QrScanResult) => void;
type ErrorHandler = (message: string) => void;

/**
 * Обёртка над html5-qrcode с корректной очисткой ресурсов камеры.
 * Элемент с id `elementId` должен существовать в DOM к моменту `start()`.
 */
export class QrScanner {
  private scanner: Html5Qrcode | null = null;
  private lastDecoded: string | null = null;
  private running = false;

  async start(
    elementId: string,
    onResult: ScanHandler,
    onError?: ErrorHandler,
  ): Promise<void> {
    this.stop().catch(() => undefined);
    this.scanner = new Html5Qrcode(elementId);
    this.lastDecoded = null;
    this.running = true;

    try {
      await this.scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (this.lastDecoded === decodedText) return;
          this.lastDecoded = decodedText;
          try {
            onResult(parseDeviceQrPayload(decodedText));
          } catch (err) {
            onError?.(err instanceof Error ? err.message : String(err));
          }
        },
        (errMessage) => {
          // html5-qrcode зовёт error-колбэк почти каждый кадр при отсутствии QR.
          onError?.(errMessage);
        },
      );
    } catch (err) {
      this.running = false;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(describeCameraError(msg));
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  async stop(): Promise<void> {
    this.running = false;
    const scanner = this.scanner;
    this.scanner = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // Камера уже закрыта или никогда не открывалась — не критично.
    }
  }
}

function describeCameraError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("permission") || lower.includes("notallowed")) {
    return "Нет доступа к камере. Разрешите доступ в настройках браузера и попробуйте снова.";
  }
  if (lower.includes("notfound") || lower.includes("no camera")) {
    return "Камера не найдена на устройстве.";
  }
  return msg;
}
