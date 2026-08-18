import { useCallback, useEffect, useState } from "react";
import type { Connection, PublicKey } from "@solana/web3.js";
import type { NetworkConfig } from "../types";
import { getEnrgTokenBalance, getSolBalanceLamports, requestAirdrop } from "../lib/solana";
import { listRegisteredDevices, removeRegisteredDevice } from "../lib/devices";
import type { RegisteredDevice } from "../lib/devices";

interface Props {
  pubkey: PublicKey;
  connection: Connection;
  network: NetworkConfig;
  onConnectDevice: () => void;
  onNetworkChange: (id: NetworkConfig["id"]) => void;
  networks: NetworkConfig[];
}

export default function Dashboard({
  pubkey,
  connection,
  network,
  onConnectDevice,
  onNetworkChange,
  networks,
}: Props) {
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [srcBalance, setSrcBalance] = useState<string | null>(null);
  const [airdropBusy, setAirdropBusy] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const lamports = await getSolBalanceLamports(connection, pubkey);
    setSolLamports(lamports);
    const src = await getEnrgTokenBalance(connection, pubkey);
    setSrcBalance(src.formatted);
  }, [connection, pubkey]);

  useEffect(() => {
    setDevices(listRegisteredDevices());
    void refresh();
  }, [refresh]);

  const handleAirdrop = async () => {
    setAirdropBusy(true);
    setAirdropMsg(null);
    try {
      const sig = await requestAirdrop(connection, pubkey, 1);
      setAirdropMsg(`Airdrop отправлен: ${sig.slice(0, 12)}…`);
      await refresh();
    } catch (err) {
      setAirdropMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropBusy(false);
    }
  };

  const copyPubkey = async () => {
    try {
      await navigator.clipboard.writeText(pubkey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard недоступен — молча игнорируем */
    }
  };

  const sol = solLamports === null ? "…" : (solLamports / 1e9).toFixed(4);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Дашборд</h1>
        <div className="flex items-center gap-1">
          {networks.map((n) => (
            <button
              key={n.id}
              onClick={() => onNetworkChange(n.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                network.id === n.id
                  ? "bg-axis-accent text-slate-950"
                  : "border border-axis-border text-slate-400 hover:bg-slate-800"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
      {/* Адрес */}
      <div className="rounded-2xl border border-axis-border bg-axis-panel p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Мой кошелёк</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="break-all font-mono text-sm text-slate-200">{pubkey.toBase58()}</span>
          <button
            onClick={copyPubkey}
            className="shrink-0 rounded-md border border-axis-border px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            {copied ? "✓" : "копировать"}
          </button>
        </div>
      </div>

      {/* Балансы */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-axis-border bg-axis-panel p-4">
          <p className="text-xs text-slate-500">SOL</p>
          <p className="mt-1 text-2xl font-bold text-white">{sol}</p>
        </div>
        <div className="rounded-2xl border border-axis-border bg-axis-panel p-4">
          <p className="text-xs text-slate-500">SRC (ENRG)</p>
          <p className="mt-1 text-2xl font-bold text-axis-accent">
            {srcBalance === null ? "…" : srcBalance}
          </p>
        </div>
      </div>

      {/* Airdrop */}
      {network.airdrop && (
        <button
          onClick={handleAirdrop}
          disabled={airdropBusy}
          className="rounded-xl border border-axis-border px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {airdropBusy ? "Отправка airdrop…" : `Получить 1 SOL (${network.label})`}
        </button>
      )}
      {airdropMsg && <p className="text-xs text-slate-400">{airdropMsg}</p>}

      {/* Главный CTA */}
      <button
        onClick={onConnectDevice}
        className="rounded-2xl bg-axis-accent px-4 py-4 text-base font-bold text-slate-950 transition hover:brightness-110"
      >
        Подключить устройство
      </button>

      {/* Мои устройства */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Мои устройства</h2>
        {devices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-axis-border p-4 text-center text-xs text-slate-500">
            Пока нет устройств. Отсканируйте QR на девайсе, чтобы добавить его.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {devices.map((d) => (
              <li
                key={d.deviceId}
                className="flex items-center justify-between rounded-xl border border-axis-border bg-axis-panel px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-slate-300">{d.deviceId}</p>
                  <p className="text-[11px] text-slate-500">
                    {d.state} · {new Date(d.addedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setDevices(removeRegisteredDevice(d.deviceId))}
                  className="ml-2 rounded-md border border-axis-border px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                  title="Удалить из списка"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
