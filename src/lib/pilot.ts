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
import { ENRG_PROGRAM_ID, ORACLE_URL } from "../config";
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

/** Proofs from the public oracle REST API (ADR-0010 data bridge). */
export async function fetchOracleProofs(
  devicePubkey: PublicKey,
  limit = 30,
): Promise<PilotProof[]> {
  const deviceHex = bytesToHex(devicePubkey.toBytes());
  const url = `${ORACLE_URL}/api/v1/proofs?device_id=0x${deviceHex}&limit=${limit}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`oracle proofs: HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    ok: boolean;
    proofs?: Array<{
      device_id: string;
      ts: number;
      energy_wh: number;
      nonce: number;
      mint_tx: string | null;
      mint_status: string;
    }>;
  };
  if (!data.ok || !Array.isArray(data.proofs)) return [];
  return data.proofs
    .map((r) => ({
      deviceId: r.device_id,
      timestamp: r.ts,
      verifiedAt: r.ts,
      energyWh: r.energy_wh,
      nonce: r.nonce,
      oracle: "",
      signature: r.mint_tx ?? "",
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Oracle-first, chain-fallback proof history. The oracle REST endpoint is the
 * freshest source (persisted at submission time); when it is unreachable or
 * empty, the proof stream is reconstructed from on-chain mint transactions.
 */
export async function fetchPilotProofs(
  connection: Connection,
  devicePubkey: PublicKey,
  limit = 30,
): Promise<PilotProof[]> {
  try {
    const oracle = await fetchOracleProofs(devicePubkey, limit);
    if (oracle.length > 0) return oracle;
  } catch {
    /* fall through to the chain */
  }
  return fetchProofHistory(connection, devicePubkey, limit);
}

/** Today's production (kWh) from proofs since local midnight. */
export function proofsTodayKwh(proofs: PilotProof[]): number {
  if (proofs.length === 0) return 0;
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  let wh = 0;
  for (const p of proofs) {
    const tsMs = p.timestamp * 1000;
    if (tsMs >= dayStart.getTime() && tsMs <= now) wh += p.energyWh;
  }
  return wh / 1000;
}

/** Current power (W) from the last proof interval (1 Wh / 60 s ≈ 60 W). */
export function proofsCurrentPowerW(proofs: PilotProof[]): number {
  if (proofs.length === 0) return 0;
  if (proofs.length === 1) {
    // Single proof: assume the nominal 1 Wh per 60 s interval.
    return proofs[0].energyWh * (3600 / 60);
  }
  const a = proofs[proofs.length - 2];
  const b = proofs[proofs.length - 1];
  const dt = b.timestamp - a.timestamp;
  if (dt <= 0) return 0;
  return (b.energyWh / dt) * 3600;
}

/**
 * 24h chart buckets from proofs (energyWh per hour → kW), sorted by hour.
 */
export function proofsChartData(proofs: PilotProof[]): { label: string; kw: number }[] {
  const buckets = new Map<string, { wh: number }>();
  for (const p of proofs) {
    const d = new Date(p.timestamp * 1000);
    const key = `${String(d.getHours()).padStart(2, "0")}:00`;
    const b = buckets.get(key) ?? { wh: 0 };
    b.wh += p.energyWh;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, b]) => ({
      label,
      kw: Math.round((b.wh / 1000) * 100) / 100,
    }));
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
