import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetworkConfig, TxRecord, EnergyProducerData } from "../types";
import {
  getEnrgTokenBalance,
  getEnrgTokenMint,
  getRecentTokenTransfers,
  getSolBalanceLamports,
  requestAirdrop,
} from "../lib/solana";
import { listRegisteredDevices } from "../lib/devices";
import type { RegisteredDevice } from "../lib/devices";
import { fetchDeviceSignerInfo } from "../lib/deviceSigner";
import { ensureSeedData, getEnergyHistory } from "../lib/energyHistory";
import { getEnergyProducer } from "../lib/enrgTx";
import { ENRG_PROGRAM_ID } from "../config";
import {
  LOW_SOL_THRESHOLD,
  deriveKwhPerSrc,
  getCurrentPowerW,
  getTotalEnergyKwh,
  getTodayKwh,
  todayProgress,
} from "../lib/energySummary";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";
import DripTokens from "./DripTokens";

interface Props {
  pubkey: PublicKey;
  connection: Connection;
  network: NetworkConfig;
  networks: NetworkConfig[];
  onConnectDevice: () => void;
  onNetworkChange: (id: NetworkConfig["id"]) => void;
  onOpenDevice: (deviceId: string) => void;
  onOpenSettings: () => void;
}

interface ChartBucket {
  label: string;
  kw: number;
}

function deviceName(id: string): string {
  return `ESP32-${id.slice(-4).toUpperCase()}`;
}

export default function Dashboard({
  pubkey,
  connection,
  network,
  onConnectDevice,
  onOpenDevice,
  onOpenSettings,
}: Props) {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [producers, setProducers] = useState<Record<string, EnergyProducerData | null>>({});
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [srcRaw, setSrcRaw] = useState<bigint | null>(null);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [airdropBusy, setAirdropBusy] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);

  // ── Devices + demo history ──
  useEffect(() => {
    const list = listRegisteredDevices();
    setDevices(list);
    list.forEach((d) => ensureSeedData(d.deviceId));
  }, []);

  // ── On-chain device data (EnergyProducer) + online/offline ──
  useEffect(() => {
    if (devices.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const prodMap: Record<string, EnergyProducerData | null> = {};
      const onlineMap: Record<string, boolean> = {};
      for (const d of devices) {
        prodMap[d.deviceId] = await getEnergyProducer(
          connection,
          ENRG_PROGRAM_ID,
          new PublicKey(d.deviceId),
        );
        try {
          const info = await fetchDeviceSignerInfo(new PublicKey(d.deviceId), 1000);
          onlineMap[d.deviceId] = info !== null;
        } catch {
          onlineMap[d.deviceId] = false;
        }
      }
      if (!cancelled) {
        setProducers(prodMap);
        setOnline(onlineMap);
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connection, devices]);

  // ── Balances (SOL hidden; only needed for gas) ──
  const refreshBalances = useCallback(async () => {
    const lamports = await getSolBalanceLamports(connection, pubkey);
    setSolLamports(lamports);
    const src = await getEnrgTokenBalance(connection, pubkey);
    setSrcRaw(src.raw);
  }, [connection, pubkey]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  // ── SRC accrual history ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const mint = await getEnrgTokenMint();
      const records = await getRecentTokenTransfers(connection, pubkey, mint, 5);
      if (!cancelled) setTxHistory(records);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [connection, pubkey]);
  // ── Energy summary ──
  const totalKwh = useMemo(() => {
    const prodArr = devices.map((d) => producers[d.deviceId] ?? null);
    return getTotalEnergyKwh(prodArr, devices.map((d) => d.deviceId));
  }, [devices, producers]);

  const src = srcRaw === null ? 0n : srcRaw;
  const kwhPerSrc = deriveKwhPerSrc(totalKwh, src);
  const srcKwh = (Number(src) / 1_000_000_000) * kwhPerSrc;

  const currentPowerW = useMemo(
    () => devices.reduce((acc, d) => acc + getCurrentPowerW(d.deviceId), 0),
    [devices],
  );

  // ── 24h chart (aggregated across devices) ──
  const chartData = useMemo<ChartBucket[]>(() => {
    const buckets = new Map<number, { sum: number; count: number }>();
    for (const d of devices) {
      for (const p of getEnergyHistory(d.deviceId)) {
        const key = new Date(p.ts);
        key.setMinutes(0, 0, 0);
        const b = buckets.get(key.getTime()) ?? { sum: 0, count: 0 };
        b.sum += p.powerW;
        b.count += 1;
        buckets.set(key.getTime(), b);
      }
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, b]) => {
        const d = new Date(ts);
        const powerW = b.sum / b.count;
        return {
          label: `${String(d.getHours()).padStart(2, "0")}:00`,
          kw: Math.round((powerW / 1000) * 100) / 100,
        };
      });
  }, [devices]);

  // ── Animations ──
  const totalKwhAnimated = useAnimatedNumber(totalKwh, 1200);
  const srcAnimated = useAnimatedNumber(Number(src) / 1_000_000_000, 800);

  const lowGas = solLamports !== null && solLamports / 1e9 < LOW_SOL_THRESHOLD;
  const deviceTag = devices.length === 1 ? ` (${deviceName(devices[0].deviceId)})` : "";

  const handleAirdrop = async () => {
    setAirdropBusy(true);
    setAirdropMsg(null);
    try {
      const sig = await requestAirdrop(connection, pubkey, 1);
      setAirdropMsg(`Airdrop sent: ${sig.slice(0, 12)}…`);
      await refreshBalances();
    } catch (err) {
      setAirdropMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropBusy(false);
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Axis" className="h-8 w-8" />
          <h1 className="text-lg font-bold text-ink">Energy</h1>
          <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] text-subtle">
            {network.label}
          </span>
        </div>
        <button
          onClick={onOpenSettings}
          className="rounded-xl border border-edge px-3 py-1.5 text-sm text-mut transition hover:bg-soft"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>

      {/* HERO: energy produced */}
      <div className="relative overflow-hidden rounded-3xl border border-edge bg-gradient-to-br from-axis-accent/15 via-panel to-panel p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-axis-accent/10 blur-2xl" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-mut">Energy produced</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="count-glow text-5xl font-bold tabular-nums tracking-tight text-ink">
            {totalKwhAnimated.toFixed(1)}
          </span>
          <span className="text-lg font-medium text-mut">kWh</span>
        </div>
        <p className="mt-2 text-sm text-axis-success">
          earned: {srcAnimated.toFixed(2)} SRC
          <span className="text-mut"> ≈ {srcKwh.toFixed(1)} kWh</span>
        </p>

        {lowGas && (
          <div className="mt-3 rounded-xl border border-axis-warn/40 bg-soft p-3">
            <p className="text-xs text-axis-warn">⚠️ Not enough SOL for fees (gas).</p>
            <button
              onClick={handleAirdrop}
              disabled={airdropBusy}
              className="mt-2 w-full rounded-lg bg-axis-accent px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {airdropBusy ? "Sending…" : `Get 1 SOL (${network.label})`}
            </button>
            {airdropMsg && <p className="mt-1 text-[11px] text-mut">{airdropMsg}</p>}
          </div>
        )}
      </div>

      {/* Add device — always visible */}
      <button
        onClick={onConnectDevice}
        className="rounded-2xl bg-axis-accent px-4 py-4 text-base font-bold text-white shadow-lg shadow-axis-accent/20 transition hover:brightness-110"
      >
        + Add device
      </button>
      {/* Chart + current power */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-mut">Current power</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="dot-pulse h-2 w-2 rounded-full bg-axis-success" />
              <p className="power-pulse text-3xl font-bold tabular-nums text-axis-accent">
                {(currentPowerW / 1000).toFixed(2)}
                <span className="ml-1 text-sm font-normal text-mut">kW</span>
              </p>
            </div>
          </div>
          <span className="text-xs text-mut">over the last 24 hours</span>
        </div>

        <div className="mt-3 h-36 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--c-edge)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--c-mut)" }} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "var(--c-mut)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--c-panel)",
                    border: "1px solid var(--c-edge)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--c-mut)" }}
                />
                <Area
                  type="monotone"
                  dataKey="kw"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="url(#energyGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="relative h-14 w-14">
                <span className="placeholder-orbit absolute inset-0 rounded-full border border-dashed border-axis-accent/40" />
                <span className="absolute inset-2 rounded-full bg-axis-accent/10" />
                <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-axis-accent" />
              </div>
              <p className="text-xs text-subtle">
                Add a device — the production chart will appear here
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SRC — accumulated energy */}
      <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-4">
        <p className="text-[11px] uppercase tracking-wider text-mut">SRC · accumulated energy</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-3xl font-bold tabular-nums text-axis-success">
            {srcAnimated.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-mut">SRC</span>
          </p>
        </div>
        <p className="mt-1 text-xs text-mut">≈ {srcKwh.toFixed(1)} kWh of energy</p>
        <DripTokens balanceRaw={src} />
      </div>
      {/* Devices */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Devices</h2>
        {devices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge p-6 text-center">
            <p className="text-3xl">⚡</p>
            <p className="mt-2 text-sm text-mut">No devices yet</p>
            <p className="mt-1 text-xs text-subtle">
              Scan the QR code to connect an energy generator
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {devices.map((d) => {
              const onlineNow = online[d.deviceId] === true;
              const todayKwh = getTodayKwh(d.deviceId);
              const progress = todayProgress(d.deviceId);
              return (
                <li key={d.deviceId}>
                  <button
                    onClick={() => onOpenDevice(d.deviceId)}
                    className="w-full rounded-2xl border border-edge bg-panel p-3 text-left transition hover:bg-soft"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${onlineNow ? "dot-pulse bg-axis-success" : "bg-subtle"}`}
                        />
                        <p className="font-semibold text-ink">{deviceName(d.deviceId)}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          onlineNow ? "bg-axis-success/15 text-axis-success" : "bg-soft text-subtle"
                        }`}
                      >
                        {onlineNow ? "online" : "offline"}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-mut">
                      Today: <span className="font-semibold text-ink">{todayKwh.toFixed(2)}</span>{" "}
                      kWh
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-soft">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-axis-accent to-axis-success transition-all"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Accrual history — human-friendly labels */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Accruals</h2>
        {txHistory.length === 0 ? (
          <p className="rounded-xl border border-dashed border-edge p-4 text-center text-xs text-subtle">
            No accruals yet. They will appear once a device starts generating energy.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {txHistory.map((t) => {
              const srcAmount = Number(t.amount) / 1_000_000_000;
              const kwh = srcAmount * kwhPerSrc;
              return (
                <li
                  key={t.signature}
                  className="flex items-center justify-between rounded-xl border border-edge bg-panel px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-axis-success">
                      +{srcAmount.toFixed(1)} SRC{" "}
                      <span className="text-mut">for {kwh.toFixed(1)} kWh{deviceTag}</span>
                    </p>
                    <p className="text-[10px] text-subtle">
                      {t.timestamp ? new Date(t.timestamp * 1000).toLocaleString() : "—"}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-2xl"
                    role="img"
                    aria-label="energy accrued"
                    title="Energy accrual"
                  >
                    ⚡
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
