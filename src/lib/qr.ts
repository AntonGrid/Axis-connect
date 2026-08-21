import { PublicKey } from "@solana/web3.js";
import { Html5Qrcode } from "html5-qrcode";
import { AXIS_ENERGY_SCHEMA } from "../types";
import type { QrScanResult } from "../types";
import { base58Decode, bytesToHex, hexToBytes } from "./encoding";

/**
 * Parsing and validation of the JSON from a device QR code.
 * Expected format (fixed by the protocol):
 *   { "deviceId": "PUBLIC_KEY", "schema": "axis-energy-v1" }
 */
export function parseDeviceQrPayload(raw: string): QrScanResult {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("QR does not contain valid JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("QR: expected a JSON object");
  }
  const { deviceId, schema } = payload as Record<string, unknown>;
  if (typeof deviceId !== "string" || deviceId.trim().length === 0) {
    throw new Error("QR: missing deviceId field");
  }
  if (schema !== AXIS_ENERGY_SCHEMA) {
    throw new Error(
      `QR: incompatible schema "${String(schema)}" (expected "${AXIS_ENERGY_SCHEMA}")`,
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
 * deviceId normalization → Solana PublicKey.
 * Accepts base58 (32 bytes) or "0x" + 64 hex.
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
      throw new Error("deviceId: neither base58 nor 0x-hex");
    }
  }
  if (bytes.length !== 32) {
    throw new Error(`deviceId: expected 32 bytes, got ${bytes.length}`);
  }
  return new PublicKey(bytes);
}

/** "0x" + 64 hex — canonical device_id of the ESP32 firmware. */
export function toDeviceIdHex(pubkey: PublicKey): string {
  return "0x" + bytesToHex(pubkey.toBytes());
}

/** device_id tail (last 4 hex chars) — for the mDNS name "Axis-Device-XXXX". */
export function deviceIdShort(pubkey: PublicKey): string {
  return toDeviceIdHex(pubkey).replace(/^0x/, "").slice(-4).toUpperCase();
}

type ScanHandler = (result: QrScanResult) => void;
type ErrorHandler = (message: string) => void;

/**
 * Wrapper around html5-qrcode with correct camera-resource cleanup.
 * An element with id `elementId` must exist in the DOM when `start()` is called.
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
          // html5-qrcode calls the error callback almost every frame with no QR present.
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
      // Camera already closed or never opened — not critical.
    }
  }
}

function describeCameraError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("permission") || lower.includes("notallowed")) {
    return "No camera access. Allow camera access in the browser settings and try again.";
  }
  if (lower.includes("notfound") || lower.includes("no camera")) {
    return "No camera found on this device.";
  }
  return msg;
}
