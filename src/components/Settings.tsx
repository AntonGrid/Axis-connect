import { useState } from "react";
import type { NetworkConfig, ThemeMode } from "../types";
import { exportSecretBase58 } from "../lib/wallet";
import { toggleTheme } from "../lib/theme";
import { hasInjectedWallet, walletPublicKey, type WalletLike } from "../lib/walletProvider";

interface Props {
  wallet: WalletLike;
  networks: NetworkConfig[];
  network: NetworkConfig;
  theme: ThemeMode;
  onNetworkChange: (id: NetworkConfig["id"]) => void;
  onThemeChange: (mode: ThemeMode) => void;
  onDeleteWallet: () => void;
  /** P2-3: connect the injected browser wallet (Phantom/Solflare). */
  onConnectInjected: () => Promise<string | null>;
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
  onConnectInjected,
  onBack,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(false);

  const injectedAvailable = hasInjectedWallet();
  const isInjected = wallet.kind === "injected";

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletPublicKey(wallet).toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      {/* clipboard unavailable */}
    }
  };

  const handleConnectInjected = async () => {
    setConnecting(true);
    setConnectError(false);
    try {
      const pk = await onConnectInjected();
      if (!pk) setConnectError(true);
    } finally {
      setConnecting(false);
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-xl border border-edge px-3 py-2 text-sm text-mut transition hover:bg-soft"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-ink">Settings</h1>
        <span className="w-16" />
      </div>

      {/* Wallet address */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Wallet address</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="break-all font-mono text-xs text-ink">{walletPublicKey(wallet).toBase58()}</span>
          <button
            onClick={copyAddress}
            className="shrink-0 rounded-md border border-edge px-2 py-1 text-xs text-mut transition hover:bg-soft"
          >
            {copied ? "✓" : "copy"}
          </button>
        </div>
        {isInjected && (
          <p className="mt-1 text-[11px] text-axis-accent">Signed by the browser wallet extension</p>
        )}
      </div>

      {/* Browser wallet (P2-3) */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Browser wallet</p>
        {isInjected ? (
          <p className="mt-2 text-xs text-mut">Connected — transactions are signed by the extension.</p>
        ) : injectedAvailable ? (
          <>
            <button
              onClick={handleConnectInjected}
              disabled={connecting}
              className="mt-3 w-full rounded-xl border border-axis-accent/60 px-4 py-2 text-sm font-medium text-axis-accent transition hover:bg-axis-accent/10 disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect Phantom / Solflare"}
            </button>
            {connectError && (
              <p className="mt-2 text-[11px] text-axis-danger">Connection failed or was cancelled.</p>
            )}
          </>
        ) : (
          <p className="mt-2 text-[11px] text-subtle">
            No wallet extension detected. Install Phantom or Solflare to sign with the extension
            instead of a local key.
          </p>
        )}
      </div>

      {/* Network */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-mut">Network</p>
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

      {/* Theme */}
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Theme</p>
            <p className="text-[11px] text-subtle">Light / dark</p>
          </div>
          <button
            onClick={() => onThemeChange(toggleTheme(theme))}
            className="rounded-full border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
            role="switch"
            aria-checked={theme === "light"}
          >
            {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>
      </div>
      {/* Export private key — only meaningful for the local (localStorage) wallet */}
      {!isInjected && (
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-xs uppercase tracking-wide text-mut">Private key</p>
          <button
            onClick={() => setShowSecret((v) => !v)}
            className="mt-3 w-full rounded-xl border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
          >
            {showSecret ? "Hide key" : "Export private key"}
          </button>
          {showSecret && (
            <div className="mt-2 rounded-xl border border-axis-warn/40 bg-soft p-3">
              <p className="text-[11px] font-medium text-axis-warn">
                ⚠️ The key grants full access to your funds. Do not share it and do not store
                it in plain sight.
              </p>
              <p className="mt-2 break-all font-mono text-[10px] text-ink">
                {wallet.kind === "local" ? exportSecretBase58(wallet.keypair) : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <div className="rounded-2xl border border-axis-danger/40 bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-axis-danger">Danger zone</p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-3 w-full rounded-xl border border-axis-danger/50 px-4 py-2 text-sm text-axis-danger transition hover:bg-axis-danger/10"
          >
            Delete wallet from this device
          </button>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-mut">
              The key will be removed from localStorage. Without a backup, recovery is impossible.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-edge px-4 py-2 text-sm text-mut transition hover:bg-soft"
              >
                Cancel
              </button>
              <button
                onClick={onDeleteWallet}
                className="flex-1 rounded-xl bg-axis-danger px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-subtle">Axis Connect v0.2.0 · PWA · non-custodial</p>
    </div>
  );
}
