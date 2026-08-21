import type { PublicKey } from "@solana/web3.js";

/** Canonical `schema` in a device QR code (fixed by the protocol). */
export const AXIS_ENERGY_SCHEMA = "axis-energy-v1";

/**
 * QR payload on a physical device (JSON).
 *
 * ```json
 * { "deviceId": "PUBLIC_KEY", "schema": "axis-energy-v1" }
 * ```
 * `deviceId` — the device's public Ed25519 key. Accepted in two formats:
 * - base58 (canonical Solana PublicKey, 32 bytes);
 * - "0x" + 64 hex (as printed by the ESP32 firmware via INFO / boot log).
 */
export interface DeviceQrPayload {
  deviceId: string;
  schema: string;
}

/** Device lifecycle (ADR-0005, mirrors on-chain DeviceState). */
export type DeviceState =
  | "Unregistered"
  | "Registered"
  | "Claimed"
  | "Provisioned"
  | "Active"
  | "Quarantine"
  | "Maintenance"
  | "Revoked";

/** On-chain device status (from the EnergyProducer PDA). */
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
  /** Whether free SOL airdrop is allowed (devnet/localnet). */
  airdrop: boolean;
}

export type AppScreen =
  | "onboarding"
  | "dashboard"
  | "scanner"
  | "register"
  | "device"
  | "settings";

export type ThemeMode = "dark" | "light";

/** Energy-history point (local device snapshot). */
export interface EnergyPoint {
  ts: number; // unix ms
  powerW: number; // current power, W
}

/** SRC accrual history entry (from RPC token transactions). */
export interface TxRecord {
  signature: string;
  /** Delta on the user's ATA in atomic units (>=0 accrual). */
  amount: bigint;
  timestamp: number | null; // unix s
  source: "transfer" | "mint" | "unknown";
}

/** Full on-chain EnergyProducer (state/producer.rs). */
export interface EnergyProducerData {
  authority: string; // base58
  deviceId: string; // base58
  nonce: bigint;
  energyWh: bigint;
  timestamp: bigint;
  state: DeviceState;
  tier: "Basic" | "Verified" | "Industrial" | "Institutional";
  monthEnergyWh: bigint;
  monthStartTs: bigint;
  claimNonce: bigint;
  claimedAt: bigint;
  revoked: boolean;
  rotatedTo: string; // base58
  producerPda: string; // base58
}

/** Device registration step on Solana. */
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

/** QR scan result. */
export interface QrScanResult {
  raw: string;
  payload: DeviceQrPayload;
  /** Normalized Solana PublicKey of the device. */
  deviceId: PublicKey;
  /** "0x" + 64 hex — for the mDNS host and display. */
  deviceIdHex: string;
}
