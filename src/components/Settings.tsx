import { useState } from "react";
import type { Keypair } from "@solana/web3.js";
import type { NetworkConfig } from "../types";
import { exportSecretBase58 } from "../lib/wallet";

interface Props {
  wallet: Keypair;
  networks: NetworkConfig[];
  network: NetworkConfig;
  onNetworkChange: (id: NetworkConfig["id"]) => void;
  onDeleteWallet: () => void;
  onBack: () => void;
}

export default function Settings({
  wallet,
  networks,
  network,
  onNetworkChange,
  onDeleteWallet,
  onBack,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-xl border border-axis-border px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          ← Назад
        </button>
        <h1 className="text-lg font-bold text-white">Настройки</h1>
        <span className="w-16" />
      </div>

      {/* Сеть */}
      <div className="rounded-2xl border border-axis-border bg-axis-panel p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Сеть</p>
        <div className="mt-2 flex flex-wrap gap-2">
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
        <p className="mt-2 text-[11px] text-slate-500">RPC: {network.rpcUrl}</p>
      </div>

      {/* Бэкап кошелька */}
      <div className="rounded-2xl border border-axis-border bg-axis-panel p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Бэкап кошелька</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Секретный ключ (base58) позволяет восстановить кошелёк в любом совместимом приложении.
        </p>
        <button
          onClick={() => setShowSecret((v) => !v)}
          className="mt-3 w-full rounded-xl border border-axis-border px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          {showSecret ? "Скрыть ключ" : "Показать ключ"}
        </button>
        {showSecret && (
          <div className="mt-2 rounded-xl bg-black/40 p-3">
            <p className="break-all font-mono text-[10px] text-axis-warn">
              {exportSecretBase58(wallet)}
            </p>
          </div>
        )}
      </div>

      {/* Опасная зона */}
      <div className="rounded-2xl border border-axis-danger/40 bg-axis-panel p-4">
        <p className="text-xs uppercase tracking-wide text-axis-danger">Опасная зона</p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-3 w-full rounded-xl border border-axis-danger/50 px-4 py-2 text-sm text-axis-danger hover:bg-axis-danger/10"
          >
            Удалить кошелёк с этого устройства
          </button>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-slate-400">
              Ключ будет удалён из localStorage. Без бэкапа восстановление невозможно.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-axis-border px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Отмена
              </button>
              <button
                onClick={onDeleteWallet}
                className="flex-1 rounded-xl bg-axis-danger px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-600">
        Axis Connect v0.1.0 · PWA · non-custodial
      </p>
    </div>
  );
}
