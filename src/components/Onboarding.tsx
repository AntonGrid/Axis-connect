import { useState } from "react";
import type { Keypair } from "@solana/web3.js";
import { createWallet, exportSecretBase58, importWalletFromSecretBase58 } from "../lib/wallet";

interface Props {
  onCreated: (keypair: Keypair) => void;
}

/**
 * Экран 1 — Онбординг. Некастодиальный кошелёк создаётся локально
 * (Ed25519 Keypair → localStorage). Ключ никогда не покидает устройство.
 */
export default function Onboarding({ onCreated }: Props) {
  const [mode, setMode] = useState<"hero" | "import" | "backup">("hero");
  const [secretInput, setSecretInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<{ secret: string; pubkey: string } | null>(null);

  const handleCreate = () => {
    const kp = createWallet();
    setBackup({ secret: exportSecretBase58(kp), pubkey: kp.publicKey.toBase58() });
    setMode("backup");
  };

  const handleImport = () => {
    try {
      const kp = importWalletFromSecretBase58(secretInput);
      onCreated(kp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <img src="/logo.svg" alt="Axis" className="h-24 w-24 drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]" />

      {mode === "hero" && (
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-ink">Axis Connect</h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-mut">
              Подключите устройство за 10 секунд. Сканируйте QR-код и получайте
              токены за генерацию энергии.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <button
              onClick={handleCreate}
              className="rounded-2xl bg-axis-accent px-4 py-4 text-base font-bold text-white shadow-lg shadow-axis-accent/20 transition hover:brightness-110"
            >
              Создать кошелёк
            </button>
            <button
              onClick={() => { setMode("import"); setError(null); }}
              className="rounded-2xl border border-edge px-4 py-3 text-sm font-medium text-mut transition hover:bg-soft"
            >
              Импортировать кошелёк
            </button>
          </div>

          <p className="max-w-xs text-center text-[11px] leading-relaxed text-subtle">
            Некастодиальный кошелёк: ключ создаётся и хранится только на вашем
            устройстве. Для транзакций потребуется немного SOL.
          </p>
        </div>
      )}

      {mode === "import" && (
        <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-5">
          <h2 className="font-semibold text-ink">Импорт кошелька</h2>
          <textarea
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Секретный ключ base58 (64 байта)"
            rows={3}
            className="mt-3 w-full rounded-xl border border-edge bg-surface p-3 font-mono text-xs text-ink outline-none focus:border-axis-accent"
          />
          {error && <p className="mt-2 text-xs text-axis-danger">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setMode("hero"); setError(null); }}
              className="flex-1 rounded-xl border border-edge px-4 py-3 text-sm font-medium text-mut transition hover:bg-soft"
            >
              Назад
            </button>
            <button
              onClick={handleImport}
              className="flex-1 rounded-xl bg-axis-accent px-4 py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              Восстановить
            </button>
          </div>
        </div>
      )}

      {mode === "backup" && backup && (
        <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-5">
          <h2 className="font-semibold text-axis-success">Кошелёк создан</h2>
          <p className="mt-1 text-xs text-mut">
            Адрес: <span className="break-all font-mono text-ink">{backup.pubkey}</span>
          </p>
          <div className="mt-3 rounded-xl bg-soft p-3">
            <p className="text-xs font-medium text-axis-warn">
              ⚠️ Секретный ключ (base58). Сохраните его в надёжном месте — без него
              восстановить кошелёк невозможно.
            </p>
            <p className="mt-2 break-all font-mono text-[10px] text-ink">{backup.secret}</p>
          </div>
          <button
            onClick={() => onCreated(createWallet())}
            className="mt-4 w-full rounded-xl bg-axis-accent px-4 py-3 font-semibold text-white transition hover:brightness-110"
          >
            Продолжить
          </button>
        </div>
      )}
    </div>
  );
}

