import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, type Keypair } from "@solana/web3.js";
import { DEFAULT_NETWORK_ID, NETWORKS, PILOT_DEVICE_ID, PILOT_DEVICE_LABEL, STORAGE_KEYS, networkById } from "./config";
import type { AppScreen, NetworkConfig, QrScanResult, ThemeMode } from "./types";
import { deleteWallet, loadWallet } from "./lib/wallet";
import {
  connectInjectedWallet,
  detectInjectedWallet,
  walletPublicKey,
  type WalletLike,
} from "./lib/walletProvider";
import { createConnection } from "./lib/solana";
import { addRegisteredDevice, listRegisteredDevices } from "./lib/devices";
import { getTheme } from "./lib/theme";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import Scanner from "./components/Scanner";
import RegisterDevice from "./components/RegisterDevice";
import DeviceScreen from "./components/DeviceScreen";
import Settings from "./components/Settings";

export default function App() {
  const [wallet, setWallet] = useState<WalletLike | null>(() => {
    const kp = loadWallet();
    return kp ? { kind: "local", keypair: kp } : null;
  });
  const [network, setNetwork] = useState<NetworkConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.network);
      if (saved) return networkById(JSON.parse(saved) as NetworkConfig["id"]);
    } catch {
      /* corrupted value — use the default */
    }
    return networkById(DEFAULT_NETWORK_ID);
  });
  const [theme, setTheme] = useState<ThemeMode>(() => getTheme());
  const [screen, setScreen] = useState<AppScreen>(() =>
    loadWallet() ? "dashboard" : "onboarding",
  );
  const [scan, setScan] = useState<QrScanResult | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const connection = useMemo(() => createConnection(network.rpcUrl), [network]);

  // Apply the theme to <html>.
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme !== "light");
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const handleWalletCreated = useCallback((kp: Keypair) => {
    setWallet({ kind: "local", keypair: kp });
    setScreen("dashboard");
  }, []);

  // P2-3: use an injected browser wallet (Phantom/Solflare). The private key
  // stays inside the extension; the app only keeps the provider + pubkey.
  const handleInjectedConnected = useCallback(async (): Promise<string | null> => {
    const provider = detectInjectedWallet();
    if (!provider) return null;
    const pk = await connectInjectedWallet(provider);
    if (!pk) return null;
    setWallet({
      kind: "injected",
      provider,
      publicKey: new PublicKey(pk),
    });
    setScreen("dashboard");
    return pk;
  }, []);

  // "Plug & play": on first launch, attach the live DePIN pilot device so the
  // dashboard shows a real, working ESP32 (proofs minted on devnet) with zero
  // setup — no scanning, no registration ceremony.
  const ensurePilotDevice = useCallback(() => {
    if (listRegisteredDevices().some((d) => d.deviceId === PILOT_DEVICE_ID)) return;
    addRegisteredDevice(PILOT_DEVICE_ID, PILOT_DEVICE_LABEL);
  }, []);

  useEffect(() => {
    if (wallet) ensurePilotDevice();
  }, [wallet, ensurePilotDevice]);

  const handleWalletDeleted = useCallback(() => {
    deleteWallet();
    setWallet(null);
    setScan(null);
    setDeviceId(null);
    setScreen("onboarding");
  }, []);

  const handleNetworkChange = useCallback((id: NetworkConfig["id"]) => {
    setNetwork(networkById(id));
    localStorage.setItem(STORAGE_KEYS.network, JSON.stringify(id));
  }, []);

  const handleDeviceScanned = useCallback((result: QrScanResult) => {
    setScan(result);
    setScreen("register");
  }, []);

  const handleOpenDevice = useCallback((id: string) => {
    setDeviceId(id);
    setScreen("device");
  }, []);

  if (!wallet) {
    return <Onboarding onCreated={handleWalletCreated} />;
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto">
        {screen === "dashboard" && (
          <Dashboard
            pubkey={walletPublicKey(wallet)}
            connection={connection}
            network={network}
            networks={NETWORKS}
            onConnectDevice={() => setScreen("scanner")}
            onNetworkChange={handleNetworkChange}
            onOpenDevice={handleOpenDevice}
            onOpenSettings={() => setScreen("settings")}
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
            onDone={() => setScreen("dashboard")}
          />
        )}
        {screen === "device" && deviceId && (
          <DeviceScreen
            deviceId={deviceId}
            connection={connection}
            onBack={() => setScreen("dashboard")}
          />
        )}
        {screen === "settings" && (
          <Settings
            wallet={wallet}
            networks={NETWORKS}
            network={network}
            theme={theme}
            onNetworkChange={handleNetworkChange}
            onThemeChange={setTheme}
            onDeleteWallet={handleWalletDeleted}
            onConnectInjected={handleInjectedConnected}
            onBack={() => setScreen("dashboard")}
          />
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="border-t border-edge bg-panel/90 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-around">
          <NavButton
            active={screen === "dashboard"}
            onClick={() => setScreen("dashboard")}
            label="Dashboard"
            icon="▦"
          />
          <NavButton
            active={screen === "scanner"}
            onClick={() => setScreen("scanner")}
            label="Scanner"
            icon="◉"
          />
          <NavButton
            active={screen === "settings"}
            onClick={() => setScreen("settings")}
            label="Settings"
            icon="⚙"
          />
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
        active ? "text-axis-accent" : "text-subtle hover:text-mut"
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  );
}
