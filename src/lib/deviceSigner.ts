import { PublicKey } from "@solana/web3.js";
import { DEVICE_SIGNER_PORT, DEVICE_SIGNER_TIMEOUT_MS } from "../config";
import { bytesToHex, hexToBytes } from "./encoding";
import { deviceIdShort, toDeviceIdHex } from "./qr";

/**
 * Client for the ESP32 firmware local HTTP-signer (Phase 3 modernization).
 *
 * Protocol (documented in firmware/esp32_proof_sender/README.md):
 *   GET  /info        → { "deviceId": "0x…", "schema": "axis-energy-v1", "firmware": "…" }
 *   POST /sign        → body { "hex": "<message hex>" }
 *                       → { "signature": "<0x-hex 64 bytes>" }
 * The device signs ONLY domain-separated messages (register/claim/rotate);
 * arbitrary messages are rejected (closes the audit P2 note about SIGN).
 *
 * ⚠️ The mDNS name axis-device-<4hex>.local resolves in modern browsers.
 * For an HTTPS environment, a direct http:// to the device may be blocked
 * as mixed content — in that case enter the device's local IP manually.
 */

export interface DeviceSignerInfo {
  deviceId: string; // "0x" + hex
  schema: string;
  firmware?: string;
  name?: string;
}

/** Device mDNS host: "axis-device-<last4hex>.local" (matches the firmware). */
export function deviceSignerHost(deviceId: PublicKey): string {
  return `axis-device-${deviceIdShort(deviceId).toLowerCase()}.local`;
}

/** All host names the firmware may register (primary + legacy). */
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

/** Try each device mDNS host until one responds. */
async function tryHosts<T>(
  deviceId: PublicKey,
  fn: (host: string) => Promise<T>,
): Promise<T | null> {
  for (const host of deviceSignerHosts(deviceId)) {
    try {
      const result = await fn(host);
      if (result !== null && result !== undefined) return result;
    } catch {
      // try the next host
    }
  }
  return null;
}

/** Ping the device over mDNS. Returns null if the device is not found. */
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

/** Request a signature from the device (the server signs only allowed domains). */
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
      throw new Error(`Device responded with HTTP ${res.status}`);
    }
    const data = (await res.json()) as { signature?: string };
    if (typeof data.signature !== "string" || !data.signature) {
      throw new Error("Device did not return a signature field");
    }
    return hexToBytes(data.signature);
  });
  if (!result) throw new Error("Device not found on the network (mDNS) or did not answer /sign");
  return result;
}

/** Convenience wrapper: hex message → hex signature. */
export async function requestDeviceSignatureForMessage(
  deviceId: PublicKey,
  message: Uint8Array,
  timeoutMs?: number,
): Promise<Uint8Array> {
  return requestDeviceSignature(deviceId, bytesToHex(message), timeoutMs);
}

/** Signature adapter for the registration flow — takes signatures from the device over the network. */
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
