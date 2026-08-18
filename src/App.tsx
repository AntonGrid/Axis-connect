import { useCallback, useMemo, useState } from "react";
import type { Keypair } from "@solana/web3.js";
import { DEFAULT_NETWORK_ID, NETWORKS, STORAGE_KEYS, networkById } from "./config";
import type { AppScreen, NetworkConfig, QrScanResult } from "./types";
import { deleteWallet, loadWallet } from "./lib/wallet";
import { createConnection } from "./lib/solana";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import Scanner from "./components/Scanner";
import RegisterDevice from "./components/RegisterDevice";
import Settings from "./components/Settings";

export default function App() {
  const [wallet, setWallet] = useState<Keypair | null>(() => loadWallet());
  const [network, setNetwork] = useState<NetworkConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.network);
      if (saved) return networkById(JSON.parse(saved) as NetworkConfig["id"]);
    } catch {
      /* повреждённое значение — берём дефолт */
    }
    return networkById(DEFAULT_NETWORK_ID);
  });
  const [screen, setScreen] = useState<AppScreen>(() =>
    loadWallet() ? "dashboard" : "onboarding",
  );
  const [scan, setScan] = useState<QrScanResult | null>(null);

  const connection = useMemo(() => createConnection(network.rpcUrl), [network]);

  const handleWalletCreated = useCallback((kp: Keypair) => {
    setWallet(kp);
    setScreen("dashboard");
  }, []);

  const handleWalletDeleted = useCallback(() => {
    deleteWallet();
    setWallet(null);
    setScan(null);
    setScreen("onboarding");
  }, []);

  const handleNetworkChange = useCallback((id: NetworkConfig["id"]) => {
    const n = networkById(id);
    setNetwork(n);
    localStorage.setItem(STORAGE_KEYS.network, JSON.stringify(id));
  }, []);

  const handleDeviceScanned = useCallback((result: QrScanResult) => {
    setScan(result);
    setScreen("register");
  }, []);

  const handleRegistrationDone = useCallback(() => {
    setScreen("dashboard");
  }, []);

  if (!wallet) {
    return <Onboarding onCreated={handleWalletCreated} />;
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto">
        {screen === "dashboard" && (
          <Dashboard
            pubkey={wallet.publicKey}
            connection={connection}
            network={network}
            networks={NETWORKS}
            onConnectDevice={() => setScreen("scanner")}
            onNetworkChange={handleNetworkChange}
          />
        )}
        {screen === "scanner" && (
          <Scanner onResult={handleDeviceScanned} onBack={() => setScreen("dashboard")} />
        )}
        {screen === "register" && (
          <RegisterDevice
            device={scan}
            wallet={wallet}
            connection={connection}
            network={network}
            onBack={() => setScreen("scanner")}
            onDone={handleRegistrationDone}
          />
        )}
        {screen === "settings" && (
          <Settings
            wallet={wallet}
            networks={NETWORKS}
            network={network}
            onNetworkChange={handleNetworkChange}
            onDeleteWallet={handleWalletDeleted}
            onBack={() => setScreen("dashboard")}
          />
        )}
      </main>

      {/* Нижняя навигация */}
      <nav className="border-t border-axis-border bg-axis-panel/90 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-around">
          <NavButton active={screen === "dashboard"} onClick={() => setScreen("dashboard")} label="Дашборд" icon="▦" />
          <NavButton active={screen === "scanner"} onClick={() => setScreen("scanner")} label="Сканер" icon="◉" />
          <NavButton active={screen === "settings"} onClick={() => setScreen("settings")} label="Настройки" icon="⚙" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs font-medium transition ${
        active ? "text-axis-accent" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  );
}
