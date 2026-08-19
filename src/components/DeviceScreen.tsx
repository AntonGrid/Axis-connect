import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { ENRG_PROGRAM_ID } from "../config";
import { getEnergyProducer, producerPdaSync } from "../lib/enrgTx";
import { fetchDeviceSignerInfo } from "../lib/deviceSigner";
import { ensureSeedData, getEnergyHistory } from "../lib/energyHistory";
import { removeRegisteredDevice } from "../lib/devices";

interface Props {
  deviceId: string; // base58
  connection: Connection;
  onBack: () => void;
}

const INITIAL_ENERGY_PER_SRC = 1_000_000; // 1 МВт·ч = 1 SRC (v7.0 emission)

export default function DeviceScreen({ deviceId, connection, onBack }: Props) {
  const pubkey = useMemo(() => new PublicKey(deviceId), [deviceId]);
  const [producer, setProducer] = useState<Awaited<ReturnType<typeof getEnergyProducer>>>(null);
  const [online, setOnline] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  // Последний снапшот мощности (локальная история).
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
          ← Назад
        </button>
        <h1 className="text-lg font-bold text-ink">Устройство</h1>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            online ? "bg-axis-success/15 text-axis-success" : "bg-soft text-subtle"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-axis-success" : "bg-subtle"}`} />
          {online ? "онлайн" : "оффлайн"}
        </span>
      </div>

      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Публичный ключ устройства</p>
        <p className="mt-1 break-all font-mono text-xs text-ink">{deviceId}</p>
        <p className="mt-2 break-all font-mono text-[10px] text-subtle">PDA: {pda.toBase58()}</p>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">Текущая мощность</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {(lastPowerW / 1000).toFixed(2)}
            <span className="ml-1 text-sm font-normal text-mut">кВт</span>
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">Всего энергии</p>
          <p className="mt-1 text-2xl font-bold text-axis-accent">
            {totalKwh.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-mut">кВт·ч</span>
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">За месяц</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {monthKwh.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-mut">кВт·ч</span>
          </p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs text-mut">Начислено токенов (≈)</p>
          <p className="mt-1 text-2xl font-bold text-axis-success">
            {estSrc.toFixed(3)}
            <span className="ml-1 text-sm font-normal text-mut">SRC</span>
          </p>
        </div>
      </div>

      {/* On-chain статус */}
      <div className="rounded-xl border border-edge bg-panel px-4 py-2 text-xs text-mut">
        {producer ? (
          <>
            Состояние: <span className="font-semibold text-ink">{producer.state}</span> · Тир:{" "}
            <span className="font-semibold text-ink">{producer.tier}</span> · Nonce:{" "}
            <span className="font-mono">{producer.nonce.toString()}</span>
            {producer.revoked && <span className="ml-1 text-axis-danger">· отозвано</span>}
          </>
        ) : (
          <span className="text-subtle">
            Не зарегистрировано on-chain (Producer PDA не создан)
          </span>
        )}
      </div>
      {/* Отключить */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-xl border border-axis-danger/50 px-4 py-3 text-sm font-medium text-axis-danger transition hover:bg-axis-danger/10"
        >
          Отключить устройство
        </button>
      ) : (
        <div className="rounded-2xl border border-axis-danger/40 bg-panel p-4">
          <p className="text-xs text-mut">
            Устройство будет удалено из списка этого приложения. On-chain запись (Producer PDA)
            сохранится — при необходимости используйте ротацию/revoke через протокол.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
            >
              Отмена
            </button>
            <button
              onClick={handleDisconnect}
              className="flex-1 rounded-xl bg-axis-danger px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Отключить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
