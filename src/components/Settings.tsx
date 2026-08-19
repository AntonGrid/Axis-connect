import { useState } from "react";
import type { Keypair } from "@solana/web3.js";
import type { NetworkConfig, ThemeMode } from "../types";
import { exportSecretBase58 } from "../lib/wallet";
import { toggleTheme } from "../lib/theme";

interface Props {
  wallet: Keypair;
  networks: NetworkConfig[];
  network: NetworkConfig;
  theme: ThemeMode;
  onNetworkChange: (id: NetworkConfig["id"]) => void;
  onThemeChange: (mode: ThemeMode) => void;
  onDeleteWallet: () => void;
  onBack: () => void;
}

export default function Settings({
  wallet,
  networks,
  network,
  theme,
  onNetworkChange,
  onThemeChange,
  onDeleteWallet,
  onBack,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet.publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard недоступен */
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-xl border border-edge px-3 py-2 text-sm text-mut transition hover:bg-soft"
        >
          ← Назад
        </button>
        <h1 className="text-lg font-bold text-ink">Настройки</h1>
        <span className="w-16" />
      </div>

      {/* Адрес кошелька */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Адрес кошелька</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="break-all font-mono text-xs text-ink">{wallet.publicKey.toBase58()}</span>
          <button
            onClick={copyAddress}
            className="shrink-0 rounded-md border border-edge px-2 py-1 text-xs text-mut transition hover:bg-soft"
          >
            {copied ? "✓" : "копировать"}
          </button>
        </div>
      </div>

      {/* Сеть */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Сеть</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {networks.map((n) => (
            <button
              key={n.id}
              onClick={() => onNetworkChange(n.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                network.id === n.id
                  ? "bg-axis-accent text-white"
                  : "border border-edge text-mut hover:bg-soft"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-subtle">RPC: {network.rpcUrl}</p>
      </div>

      {/* Тема */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Тема</p>
            <p className="text-[11px] text-subtle">Светлая / тёмная</p>
          </div>
          <button
            onClick={() => onThemeChange(toggleTheme(theme))}
            className="rounded-full border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
            role="switch"
            aria-checked={theme === "light"}
          >
            {theme === "dark" ? "🌙 Тёмная" : "☀️ Светлая"}
          </button>
        </div>
      </div>
      {/* Экспорт приватного ключа */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Приватный ключ</p>
        <button
          onClick={() => setShowSecret((v) => !v)}
          className="mt-3 w-full rounded-xl border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
        >
          {showSecret ? "Скрыть ключ" : "Экспорт приватного ключа"}
        </button>
        {showSecret && (
          <div className="mt-2 rounded-xl border border-axis-warn/40 bg-soft p-3">
            <p className="text-[11px] font-medium text-axis-warn">
              ⚠️ Ключ даёт полный доступ к средствам. Не передавайте его никому и не храните
              в открытом виде.
            </p>
            <p className="mt-2 break-all font-mono text-[10px] text-ink">
              {exportSecretBase58(wallet)}
            </p>
          </div>
        )}
      </div>

      {/* Опасная зона */}
      <div className="rounded-2xl border border-axis-danger/40 bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-axis-danger">Опасная зона</p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-3 w-full rounded-xl border border-axis-danger/50 px-4 py-2 text-sm text-axis-danger transition hover:bg-axis-danger/10"
          >
            Удалить кошелёк с этого устройства
          </button>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-mut">
              Ключ будет удалён из localStorage. Без бэкапа восстановление невозможно.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
              >
                Отмена
              </button>
              <button
                onClick={onDeleteWallet}
                className="flex-1 rounded-xl bg-axis-danger px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-subtle">Axis Connect v0.2.0 · PWA · non-custodial</p>
    </div>
  );
}
