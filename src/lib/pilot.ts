/**
 * DePIN pilot — live proof stream + lightweight AI health, straight from the
 * Solana devnet chain (mirrors ENRG-AI agent/digital_feeds/pilot.py).
 *
 * Every successful mint_energy writes the producer PDA, and the instruction
 * carries the full OracleReport (borsh, 232 bytes: oracle, device_id, nonce,
 * device_timestamp, verified_at, energy_wh, device_signature,
 * oracle_signature). We scan recent signatures of the producer and decode the
 * reports — works even when the ESP32 counter is powered off.
 */
import type { Connection, PublicKey } from "@solana/web3.js";
import { ENRG_PROGRAM_ID } from "../config";
import { producerPdaSync } from "./enrgTx";
import { base58Decode, base58Encode, bytesToHex } from "./encoding";

export interface PilotProof {
  deviceId: string; // hex (as on the oracle)
  timestamp: number; // unix s (device timestamp)
  verifiedAt: number; // unix s (oracle verification time)
  energyWh: number;
  nonce: number;
  oracle: string; // base58
  signature: string;
}

export interface PilotHealth {
  score: number; // 0..1 (1 = plausible)
  flags: string[];
  metrics: {
    nProofs: number;
    avgIntervalSec: number;
    nightProductionCount: number;
    lastProofAt: number | null;
    totalEnergyWh: number;
  };
}

/** Decode a mint_energy OracleReport payload (base58 string from RPC JSON,
 * or raw bytes from a VersionedMessage compiled instruction). */
export function decodeMintReport(data: string | Uint8Array): Omit<PilotProof, "signature"> | null {
  let raw: Uint8Array;
  if (typeof data === "string") {
    try {
      raw = base58Decode(data);
    } catch {
      return null;
    }
  } else {
    raw = data;
  }
  if (raw.length !== 232) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const oracle = base58Encode(raw.slice(8, 40));
  const deviceId = bytesToHex(raw.slice(40, 72));
  const nonce = Number(dv.getBigUint64(72, true));
  const deviceTs = Number(dv.getBigInt64(80, true));
  const verifiedAt = Number(dv.getBigInt64(88, true));
  const energyWh = Number(dv.getBigUint64(96, true));
  return { deviceId, timestamp: deviceTs, verifiedAt, energyWh, nonce, oracle };
}

/**
 * Reconstruct recent proofs from on-chain mint_energy transactions of a
 * device. Returns chronological list (oldest first).
 */
export async function fetchProofHistory(
  connection: Connection,
  devicePubkey: PublicKey,
  limit = 30,
): Promise<PilotProof[]> {
  const producerPda = producerPdaSync(ENRG_PROGRAM_ID, devicePubkey);
  const sigs = await connection.getSignaturesForAddress(producerPda, {
    limit: Math.max(limit * 2, 40),
  });
  const out: PilotProof[] = [];
  for (const s of sigs) {
    if (s.err) continue;
    let tx;
    try {
      tx = await connection.getTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      continue;
    }
    if (!tx) continue;
    const msg = tx.transaction.message;
    const keys = msg.staticAccountKeys;
    for (const ix of msg.compiledInstructions) {
      const pid = keys[ix.programIdIndex];
      if (pid.toBase58() !== ENRG_PROGRAM_ID.toBase58()) continue;
      const rep = decodeMintReport(ix.data);
      if (rep) out.push({ ...rep, signature: s.signature });
      break;
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out.slice(-limit);
}

/** Lightweight plausibility assessment (advisory; never gates proofs). */
export function assessProofs(history: PilotProof[]): PilotHealth {
  if (history.length < 2) {
    return {
      score: 0.5,
      flags: ["insufficient_data"],
      metrics: {
        nProofs: history.length,
        avgIntervalSec: 0,
        nightProductionCount: 0,
        lastProofAt: history[0]?.timestamp ?? null,
        totalEnergyWh: history.reduce((a, p) => a + p.energyWh, 0),
      },
    };
  }
  const flags: string[] = [];
  const intervals: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const d = history[i].timestamp - history[i - 1].timestamp;
    if (d > 0) intervals.push(d);
  }
  const avg =
    intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;

  if (avg < 30 || avg > 300) flags.push("abnormal_interval");

  let nightHits = 0;
  for (const p of history) {
    const h = new Date(p.timestamp * 1000).getUTCHours();
    if (h < 5 || h >= 21) {
      if (p.energyWh > 0.1) nightHits++;
    }
  }
  if (nightHits > Math.max(1, Math.floor(history.length / 4))) {
    flags.push("night_production");
  }

  const values = history.map((p) => p.energyWh);
  if (Math.max(...values) === Math.min(...values)) {
    flags.push("constant_energy");
  }

  const score = Math.max(0, 1 - 0.33 * flags.length);
  return {
    score,
    flags,
    metrics: {
      nProofs: history.length,
      avgIntervalSec: Math.round(avg * 10) / 10,
      nightProductionCount: nightHits,
      lastProofAt: history[history.length - 1].timestamp,
      totalEnergyWh: history.reduce((a, p) => a + p.energyWh, 0),
    },
  };
}
