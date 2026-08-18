import type { PublicKey } from "@solana/web3.js";

/** Канонический `schema` в QR-коде устройства (зафиксирован протоколом). */
export const AXIS_ENERGY_SCHEMA = "axis-energy-v1";

/**
 * Пейлоад QR-кода на физическом устройстве (JSON).
 *
 * ```json
 * { "deviceId": "PUBLIC_KEY", "schema": "axis-energy-v1" }
 * ```
 * `deviceId` — публичный Ed25519-ключ устройства. Принимается в двух форматах:
 * - base58 (канонический Solana PublicKey, 32 байта);
 * - "0x" + 64 hex (как выводит прошивка ESP32 через INFO / boot-лог).
 */
export interface DeviceQrPayload {
  deviceId: string;
  schema: string;
}

/** Жизненный цикл устройства (ADR-0005, зеркалит on-chain DeviceState). */
export type DeviceState =
  | "Unregistered"
  | "Registered"
  | "Claimed"
  | "Provisioned"
  | "Active"
  | "Quarantine"
  | "Maintenance"
  | "Revoked";

/** On-chain статус устройства (из EnergyProducer PDA). */
export interface DeviceStatus {
  exists: boolean;
  state: DeviceState;
  deviceId: string | null; // base58
  owner: string | null; // base58
  producerPda: string; // base58
}

export type NetworkId = "devnet" | "localnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  rpcUrl: string;
  /** Разрешён ли бесплатный airdrop SOL (devnet/localnet). */
  airdrop: boolean;
}

export type AppScreen =
  | "onboarding"
  | "dashboard"
  | "scanner"
  | "register"
  | "settings";

/** Шаг регистрации устройства на Solana. */
export type RegistrationStepId =
  | "register"
  | "claim"
  | "provision"
  | "activate";

export interface RegistrationStepResult {
  id: RegistrationStepId;
  label: string;
  status: "pending" | "ok" | "skip" | "error";
  txid?: string;
  error?: string;
}

export interface RegistrationOutcome {
  deviceId: string; // base58
  steps: RegistrationStepResult[];
  error?: string;
}

/** Результат сканирования QR. */
export interface QrScanResult {
  raw: string;
  payload: DeviceQrPayload;
  /** Нормализованный Solana PublicKey устройства. */
  deviceId: PublicKey;
  /** "0x" + 64 hex — для mDNS-хоста и отображения. */
  deviceIdHex: string;
}
