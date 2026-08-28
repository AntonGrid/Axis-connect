import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { ENRG_PROGRAM_ID } from "../config";
import { getEnergyProducer, producerPdaSync } from "../lib/enrgTx";
import { fetchDeviceSignerInfo } from "../lib/deviceSigner";
import { ensureSeedData, getEnergyHistory } from "../lib/energyHistory";
import { removeRegisteredDevice } from "../lib/devices";
import { assessProofs, fetchProofHistory } from "../lib/pilot";
import type { PilotProof } from "../lib/pilot";

interface Props {
  deviceId: string; // base58
  connection: Connection;
  onBack: () => void;
}

const INITIAL_ENERGY_PER_SRC = 1_000_000; // 1 MWh = 1 SRC (v7.0 emission)

const FLAG_LABELS: Record<string, string> = {
  insufficient_data: "Still collecting — not enough proofs yet",
  abnormal_interval: "Irregular proof intervals (expected ~60 s)",
  night_production: "Generation during night hours (solar plausibility)",
  constant_energy: "Energy values are constant (possible stuck sensor)",
};

function healthLabel(score: number): string {
  if (score >= 0.8) return "Healthy";
  if (score >= 0.5) return "Watch";
  return "Attention";
}

export default function DeviceScreen({ deviceId, connection, onBack }: Props) {
  const pubkey = useMemo(() => new PublicKey(deviceId), [deviceId]);
  const [producer, setProducer] = useState<Awaited<ReturnType<typeof getEnergyProducer>>>(null);
  const [online, setOnline] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [proofs, setProofs] = useState<PilotProof[]>([]);
  const [proofsError, setProofsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const p = await getEnergyProducer(connection, ENRG_PROGRAM_ID, pubkey);
      if (!cancelled) setProducer(p);
      try {
        const info = await fetchDeviceSignerInfo(pubkey, 1200);
        if (!cancelled) setOnline(info !== null);
      } catch {
        /* offline */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [connection, pubkey]);

  useEffect(() => {
    ensureSeedData(deviceId);
  }, [deviceId]);

  // ── Live proofs + AI health (ADR-0010): decoded from on-chain mint_energy ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const p = await fetchProofHistory(connection, pubkey, 20);
        if (cancelled) return;
        setProofs(p);
        setProofsError(null);
      } catch (e) {
        if (!cancelled) setProofsError((e as Error).message || "proof history unavailable");
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connection, pubkey]);

  // Latest power snapshot (local history).
  const history = getEnergyHistory(deviceId);
  const lastPowerW = history.length > 0 ? history[history.length - 1].powerW : 0;
  const totalKwh = producer ? Number(producer.energyWh) / 1000 : 0;
  const monthKwh = producer ? Number(producer.monthEnergyWh) / 1000 : 0;
  const estSrc = producer ? Number(producer.monthEnergyWh) / INITIAL_ENERGY_PER_SRC : 0;

  const handleDisconnect = useCallback(() => {
    removeRegisteredDevice(deviceId);
    onBack();
  }, [deviceId, onBack]);

  const pda = producerPdaSync(ENRG_PROGRAM_ID, pubkey);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-xl border border-edge px-3 py-2 text-sm text-mut transition hover:bg-soft"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-ink">Device</h1>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            online ? "bg-axis-success/15 text-axis-success" : "bg-soft text-subtle"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-axis-success" : "bg-subtle"}`} />
          {online ? "online" : "offline"}
        </span>
      </div>

      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Device public key</p>
        <p className="mt-1 break-all font-mono text-xs text-ink">{deviceId}</p>
        <p className="mt-2 break-all font-mono text-[10px] text-subtle">PDA: {pda.toBase58()}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">Current power</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {(lastPowerW / 1000).toFixed(2)}
            <span className="ml-1 text-sm font-normal text-mut">kW</span>
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">Total energy</p>
          <p className="mt-1 text-2xl font-bold text-axis-accent">
            {totalKwh.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-mut">kWh</span>
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">This month</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {monthKwh.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-mut">kWh</span>
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">Tokens accrued (≈)</p>
          <p className="mt-1 text-2xl font-bold text-axis-success">
            {estSrc.toFixed(3)}
            <span className="ml-1 text-sm font-normal text-mut">SRC</span>
          </p>
        </div>
      </div>

      {/* On-chain status */}
      <div className="rounded-xl border border-edge bg-panel px-4 py-2 text-xs text-mut">
        {producer ? (
          <>
            State: <span className="font-semibold text-ink">{producer.state}</span> · Tier:{" "}
            <span className="font-semibold text-ink">{producer.tier}</span> · Nonce:{" "}
            <span className="font-mono">{producer.nonce.toString()}</span>
            {producer.revoked && <span className="ml-1 text-axis-danger">· revoked</span>}
          </>
        ) : (
          <span className="text-subtle">
            Not registered on-chain (Producer PDA not created)
          </span>
        )}
      </div>
      {/* AI health (ADR-0010 L2) — advisory plausibility from the proof stream */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-mut">AI health</p>
          {proofs.length > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                assessProofs(proofs).score >= 0.8
                  ? "bg-axis-success/15 text-axis-success"
                  : assessProofs(proofs).score >= 0.5
                    ? "bg-amber-500/15 text-amber-500"
                    : "bg-axis-danger/15 text-axis-danger"
              }`}
            >
              {healthLabel(assessProofs(proofs).score)}
            </span>
          )}
        </div>
        {proofsError ? (
          <p className="mt-2 text-xs text-subtle">{proofsError}</p>
        ) : proofs.length === 0 ? (
          <p className="mt-2 text-xs text-subtle">
            Collecting on-chain proofs… (appears when the device mints)
          </p>
        ) : (
          (() => {
            const h = assessProofs(proofs);
            return (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-soft">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-axis-accent to-axis-success"
                      style={{ width: `${Math.round(h.score * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-ink">
                    {Math.round(h.score * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-mut">
                  {h.metrics.nProofs} proofs · avg interval{" "}
                  {h.metrics.avgIntervalSec.toFixed(0)} s
                </p>
                {h.flags.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {h.flags.map((f) => (
                      <li key={f} className="text-xs text-amber-600">
                        ⚠ {FLAG_LABELS[f] ?? f}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* Live proofs — latest minted energy reports, straight from the chain */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Live proofs</p>
        {proofs.length === 0 ? (
          <p className="mt-2 text-xs text-subtle">
            No minted proofs yet — they appear ~60 s after the device generates energy.
          </p>
        ) : (
          <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {[...proofs]
              .reverse()
              .slice(0, 12)
              .map((p) => (
                <li
                  key={p.signature}
                  className="flex items-center justify-between rounded-lg bg-soft px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink">
                      ⚡ {p.energyWh} Wh{" "}
                      <span className="text-subtle">· nonce {p.nonce}</span>
                    </p>
                    <p className="truncate font-mono text-[9px] text-subtle">
                      {new Date(p.timestamp * 1000).toLocaleString()}
                    </p>
                  </div>
                  <span className="ml-2 shrink-0 text-[9px] font-medium text-axis-success">
                    minted
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Disconnect */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-xl border border-axis-danger/50 px-4 py-3 text-sm font-medium text-axis-danger transition hover:bg-axis-danger/10"
        >
          Disconnect device
        </button>
      ) : (
        <div className="rounded-2xl border border-axis-danger/40 bg-panel p-4">
          <p className="text-xs text-mut">
            The device will be removed from this app's list. The on-chain record (Producer PDA)
            will remain — use rotation/revoke through the protocol if needed.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
            >
              Cancel
            </button>
            <button
              onClick={handleDisconnect}
              className="flex-1 rounded-xl bg-axis-danger px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
