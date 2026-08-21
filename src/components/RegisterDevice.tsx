import { useCallback, useEffect, useState } from "react";
import type { Connection, Keypair } from "@solana/web3.js";
import type { NetworkConfig, QrScanResult, RegistrationOutcome, RegistrationStepResult } from "../types";
import { ENRG_PROGRAM_ID } from "../config";
import {
  buildActivateDeviceIx,
  buildClaimDeviceIx,
  buildEd25519PrecompileIx,
  buildProvisionDeviceIx,
  buildRegisterDeviceIx,
  deviceClaimMessage,
  deviceRegisterMessage,
  getDeviceStatus,
  ownerDevicesPdaSync,
  producerPdaSync,
  registerDeviceFlow,
  sendUserTransaction,
} from "../lib/enrgTx";
import type { DeviceStatus } from "../lib/enrgTx";
import { createDeviceSignerProvider, fetchDeviceSignerInfo } from "../lib/deviceSigner";
import type { DeviceSignerInfo } from "../lib/deviceSigner";
import { bytesToHex, hexToBytes } from "../lib/encoding";
import { addRegisteredDevice } from "../lib/devices";

interface Props {
  device: QrScanResult | null;
  wallet: Keypair;
  connection: Connection;
  network: NetworkConfig;
  onBack: () => void;
  onDone: (deviceIdBase58: string) => void;
}

interface ManualMessage {
  kind: "register" | "claim";
  hex: string;
  ts: string;
  nonce?: string;
}

/**
 * Screen 3 — Device registration on Solana.
 *
 * Automatic mode: device signatures are requested via the firmware local
 * HTTP-signer (mDNS axis-XXXX.local:8080). If the device is not found on the
 * network — manual fallback via the Serial SIGN command.
 */
export default function RegisterDevice({ device, wallet, connection, network, onBack, onDone }: Props) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [signerInfo, setSignerInfo] = useState<DeviceSignerInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RegistrationOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualMsgs, setManualMsgs] = useState<ManualMessage[]>([]);
  const [manualSigs, setManualSigs] = useState<Record<string, string>>({});

  const refreshStatus = useCallback(async () => {
    if (!device) return;
    setError(null);
    try {
      const st = await getDeviceStatus(connection, ENRG_PROGRAM_ID, device.deviceId);
      setStatus(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connection, device]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  if (!device) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <div className="rounded-2xl border border-edge bg-panel p-6 text-center">
          <p className="text-sm text-mut">First, scan the device QR code.</p>
          <button
            onClick={onBack}
            className="mt-4 rounded-xl bg-axis-accent px-4 py-2 text-sm font-semibold text-white"
          >
            To scanning
          </button>
        </div>
      </div>
    );
  }

  const deviceId = device.deviceId;
  const producer = producerPdaSync(ENRG_PROGRAM_ID, deviceId);
  const ownerDevices = ownerDevicesPdaSync(ENRG_PROGRAM_ID, wallet.publicKey);

  const findDevice = async () => {
    setChecking(true);
    setError(null);
    try {
      const info = await fetchDeviceSignerInfo(deviceId);
      setSignerInfo(info);
      if (!info) {
        setError("Device not found on the network. Make sure the device and the phone are on the same Wi-Fi network.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const runAuto = async () => {
    if (!signerInfo) {
      setError("Find the device on the network first.");
      return;
    }
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      const provider = createDeviceSignerProvider(deviceId);
      const result = await registerDeviceFlow({
        connection,
        wallet,
        deviceId,
        signRegister: provider.signRegister,
        signClaim: provider.signClaim,
      });
      setOutcome(result);
      if (result.steps.some((s) => s.status === "ok")) {
        addRegisteredDevice(deviceId.toBase58(), "Active");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };
  const generateManualMessages = async () => {
    setError(null);
    try {
      const st = status ?? (await getDeviceStatus(connection, ENRG_PROGRAM_ID, deviceId));
      const ts = BigInt(Math.floor(Date.now() / 1000));
      const msgs: ManualMessage[] = [];
      if (!st.exists || st.state === "Unregistered") {
        msgs.push({ kind: "register", hex: bytesToHex(deviceRegisterMessage(deviceId, ts)), ts: ts.toString() });
      }
      if (!st.exists || st.state === "Registered" || st.state === "Unregistered") {
        const nonce = 1n;
        msgs.push({
          kind: "claim",
          hex: bytesToHex(deviceClaimMessage(deviceId, wallet.publicKey, nonce, ts)),
          ts: ts.toString(),
          nonce: nonce.toString(),
        });
      }
      if (msgs.length === 0) {
        setError("The device is already fully registered (Active).");
        return;
      }
      setManualMsgs(msgs);
      setManualSigs({});
      setShowManual(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runManual = async () => {
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      const steps: RegistrationStepResult[] = [
        { id: "register", label: "register_device — creating the Producer PDA", status: "pending" },
        { id: "claim", label: "claim_device — linking to your wallet", status: "pending" },
        { id: "provision", label: "provision_device — configuration", status: "pending" },
        { id: "activate", label: "activate_device — activation", status: "pending" },
      ];
      const set = (id: string, patch: Partial<RegistrationStepResult>) => {
        const s = steps.find((it) => it.id === id);
        if (s) Object.assign(s, patch);
      };

      const needRegister = manualMsgs.some((m) => m.kind === "register");
      const needClaim = manualMsgs.some((m) => m.kind === "claim");
      const ts = BigInt(manualMsgs[0]?.ts ?? Math.floor(Date.now() / 1000));

      if (needRegister) {
        const sig = hexToBytes(manualSigs.register ?? "");
        if (sig.length !== 64) throw new Error("Enter a register hex signature (64 bytes)");
        const msg = deviceRegisterMessage(deviceId, ts);
        const ix = buildRegisterDeviceIx(
          ENRG_PROGRAM_ID,
          { operator: wallet.publicKey, producer, deviceId },
          { deviceSignature: sig, registerTimestamp: ts },
        );
        const txid = await sendUserTransaction(connection, wallet, [
          buildEd25519PrecompileIx(deviceId, msg, sig),
          ix,
        ]);
        set("register", { status: "ok", txid });
      } else {
        set("register", { status: "skip" });
      }

      if (needClaim) {
        const sig = hexToBytes(manualSigs.claim ?? "");
        if (sig.length !== 64) throw new Error("Enter a claim hex signature (64 bytes)");
        const nonce = BigInt(manualMsgs.find((m) => m.kind === "claim")?.nonce ?? "1");
        const msg = deviceClaimMessage(deviceId, wallet.publicKey, nonce, ts);
        const ix = buildClaimDeviceIx(
          ENRG_PROGRAM_ID,
          { authority: wallet.publicKey, producer, ownerDevices },
          { deviceSignature: sig, claimNonce: nonce, claimTimestamp: ts },
        );
        const txid = await sendUserTransaction(connection, wallet, [
          buildEd25519PrecompileIx(deviceId, msg, sig),
          ix,
        ]);
        set("claim", { status: "ok", txid });
      } else {
        set("claim", { status: "skip" });
      }

      // owner-gated steps do not require device signatures.
      if (needRegister || needClaim || status?.state === "Claimed") {
        const txid = await sendUserTransaction(connection, wallet, [
          buildProvisionDeviceIx(ENRG_PROGRAM_ID, { authority: wallet.publicKey, producer }),
        ]);
        set("provision", { status: "ok", txid });
      } else {
        set("provision", { status: "skip" });
      }
      const txid = await sendUserTransaction(connection, wallet, [
        buildActivateDeviceIx(ENRG_PROGRAM_ID, {
          authority: wallet.publicKey,
          producer,
          ownerDevices,
        }),
      ]);
      set("activate", { status: "ok", txid });

      const result: RegistrationOutcome = { deviceId: deviceId.toBase58(), steps };
      setOutcome(result);
      addRegisteredDevice(deviceId.toBase58(), "Active");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };
  const allOk =
    outcome !== null &&
    outcome.error === undefined &&
    outcome.steps.every((s) => s.status === "ok" || s.status === "skip");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={running}
          className="rounded-xl border border-edge px-3 py-2 text-sm text-mut hover:bg-soft disabled:opacity-40"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-white">Registration</h1>
        <span className="w-16" />
      </div>

      <div className="rounded-2xl border border-edge bg-panel p-4">
        <p className="text-xs uppercase tracking-wide text-subtle">Device from the QR code</p>
        <p className="mt-1 break-all font-mono text-sm text-axis-accent">{deviceId.toBase58()}</p>
        <p className="mt-1 text-[11px] text-subtle">schema: {device.payload.schema}</p>
        <p className="mt-1 break-all text-[11px] text-subtle">Producer PDA: {producer.toBase58()}</p>
      </div>

      {status && (
        <div className="rounded-xl border border-edge bg-panel px-4 py-2 text-xs text-mut">
          On-chain status: <span className="font-semibold text-white">{status.state}</span>
          {status.owner && status.owner !== wallet.publicKey.toBase58() && (
            <span className="mt-1 block text-axis-danger">
              Owner: {status.owner.slice(0, 8)}… — the device is bound to another wallet
            </span>
          )}
        </div>
      )}

      {outcome && (
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <h2 className={`text-sm font-bold ${allOk ? "text-axis-success" : "text-axis-warn"}`}>
            {allOk ? "Device registered and active! 🎉" : "Registration finished with errors"}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {outcome.steps.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-xs">
                <span
                  className={
                    s.status === "ok"
                      ? "text-axis-success"
                      : s.status === "skip"
                        ? "text-subtle"
                        : s.status === "error"
                          ? "text-axis-danger"
                          : "text-mut"
                  }
                >
                  {s.status === "ok" ? "✅" : s.status === "skip" ? "⏭" : s.status === "error" ? "❌" : "⏳"}
                </span>
                <span className="text-mut">{s.label}</span>
                {s.txid && (
                  <a
                    className="ml-auto break-all font-mono text-[10px] text-axis-accent"
                    href={`${explorerBase(network)}/tx/${s.txid}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.txid.slice(0, 16)}…
                  </a>
                )}
              </li>
            ))}
          </ul>
          {outcome.error && <p className="mt-2 text-xs text-axis-danger">{outcome.error}</p>}
        </div>
      )}

      {allOk && (
        <button
          onClick={() => onDone(deviceId.toBase58())}
          className="rounded-2xl bg-axis-success px-4 py-3 font-semibold text-white hover:brightness-110"
        >
          To dashboard
        </button>
      )}
      {!allOk && (
        <>
          <button
            onClick={findDevice}
            disabled={checking || running}
            className="rounded-xl border border-edge px-4 py-3 text-sm font-medium text-mut hover:bg-soft disabled:opacity-50"
          >
            {checking ? "Searching…" : "Find device on the network"}
          </button>

          {signerInfo && (
            <div className="rounded-xl border border-axis-success/40 bg-panel px-4 py-2 text-xs text-mut">
              Device found: <span className="font-mono">{signerInfo.deviceId}</span>
              {signerInfo.firmware ? ` · fw ${signerInfo.firmware}` : ""}
            </div>
          )}
          {!signerInfo && (
            <p className="text-center text-[11px] text-subtle">
              Not found? The device is available via mDNS axis-XXXX.local after Wi-Fi setup
              (firmware with a Captive Portal). Or use the manual mode via Serial.
            </p>
          )}

          <button
            onClick={runAuto}
            disabled={!signerInfo || running}
            className="rounded-2xl bg-axis-accent px-4 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {running ? "Registering…" : "Register automatically"}
          </button>

          <button
            onClick={generateManualMessages}
            disabled={running}
            className="rounded-xl border border-edge px-4 py-2 text-sm text-mut hover:bg-soft disabled:opacity-40"
          >
            Manual mode (Serial SIGN)
          </button>

          {showManual && (
            <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-panel p-4">
              <p className="text-xs text-mut">
                In the ESP32 monitor, run <code className="text-axis-accent">SIGN {"<hex>"}</code> for
                each message and paste the signatures (sig_hex) below.
              </p>
              {manualMsgs.map((m) => (
                <div key={m.kind} className="rounded-xl bg-soft p-3">
                  <p className="text-[11px] font-semibold uppercase text-subtle">{m.kind}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-mut">SIGN {m.hex}</p>
                  <input
                    value={manualSigs[m.kind] ?? ""}
                    onChange={(e) => setManualSigs((p) => ({ ...p, [m.kind]: e.target.value.trim() }))}
                    placeholder="sig_hex (64 bytes / 128 chars)"
                    className="mt-2 w-full rounded-lg border border-edge bg-soft p-2 font-mono text-[11px] text-ink outline-none focus:border-axis-accent"
                  />
                </div>
              ))}
              <button
                onClick={runManual}
                disabled={running}
                className="rounded-xl bg-axis-accent px-4 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {running ? "Sending…" : "Send with manual signatures"}
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-axis-danger/40 bg-panel p-3 text-xs text-axis-danger">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function explorerBase(network: NetworkConfig): string {
  if (network.id === "mainnet") return "https://explorer.solana.com";
  return `https://explorer.solana.com/?cluster=${network.id === "localnet" ? "custom" : network.id}`;
}
