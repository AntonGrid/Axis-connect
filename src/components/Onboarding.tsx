import { useState } from "react";
import type { Keypair } from "@solana/web3.js";
import { createWallet, importWalletFromSecretBase58 } from "../lib/wallet";
import { exportSecretBase58 } from "../lib/wallet";

interface Props {
  onCreated: (keypair: Keypair) => void;
}

/**
 * Экран 1 — Онбординг. Создание/восстановление локального некастодиального
 * Solana-кошелька. Закрытый ключ хранится только в localStorage браузера.
 */
export default function Onboarding({ onCreated }: Props) {
  const [restoreMode, setRestoreMode] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [showBackup, setShowBackup] = useState<{ secret: string; pubkey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    const kp = createWallet();
    setShowBackup({
      secret: exportSecretBase58(kp),
      pubkey: kp.publicKey.toBase58(),
    });
  };

  const handleRestore = () => {
    try {
      const kp = importWalletFromSecretBase58(secretInput);
      onCreated(kp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <img src="/logo.svg" alt="Axis" className="h-20 w-20" />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Axis Connect</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          Включил устройство, отсканировал QR — всё работает. Некастодиальный
          кошелёк создаётся локально, ключ не покидает ваше устройство.
        </p>
      </div>

      {showBackup ? (
        <div className="w-full max-w-md rounded-2xl border border-axis-border bg-axis-panel p-5">
          <h2 className="font-semibold text-axis-success">Кошелёк создан</h2>
          <p className="mt-1 text-xs text-slate-400">
            Адрес: <span className="break-all font-mono text-slate-300">{showBackup.pubkey}</span>
          </p>
          <div className="mt-3 rounded-xl bg-black/40 p-3">
            <p className="text-xs font-medium text-axis-warn">
              ⚠️ Секретный ключ (base58). Сохраните его в надёжном месте — восстановить кошелёк
              без него невозможно.
            </p>
            <p className="mt-2 break-all font-mono text-[10px] text-slate-300">{showBackup.secret}</p>
          </div>
          <button
            onClick={() => onCreated(createWallet())}
            className="mt-4 w-full rounded-xl bg-axis-accent px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110"
          >
            Продолжить
          </button>
        </div>
      ) : restoreMode ? (
        <div className="w-full max-w-md rounded-2xl border border-axis-border bg-axis-panel p-5">
          <h2 className="font-semibold text-white">Восстановление кошелька</h2>
          <textarea
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Секретный ключ base58 (64 байта)"
            rows={3}
            className="mt-3 w-full rounded-xl border border-axis-border bg-black/40 p-3 font-mono text-xs text-slate-200 outline-none focus:border-axis-accent"
          />
          {error && <p className="mt-2 text-xs text-axis-danger">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setRestoreMode(false); setError(null); }}
              className="flex-1 rounded-xl border border-axis-border px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Назад
            </button>
            <button
              onClick={handleRestore}
              className="flex-1 rounded-xl bg-axis-accent px-4 py-3 text-sm font-semibold text-slate-950 hover:brightness-110"
            >
              Восстановить
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-3">
          <button
            onClick={handleCreate}
            className="rounded-xl bg-axis-accent px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110"
          >
            Создать кошелёк
          </button>
          <button
            onClick={() => setRestoreMode(true)}
            className="rounded-xl border border-axis-border px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            У меня уже есть ключ
          </button>
        </div>
      )}

      <p className="max-w-md text-center text-[11px] leading-relaxed text-slate-600">
        Axis Connect — клиентское приложение экосистемы Axis/ENRG. Вы полностью
        контролируете свои ключи (non-custodial). Для работы требуется SOL на
        оплату комиссий транзакций.
      </p>
    </div>
  );
}
