import { useCallback, useEffect, useRef, useState } from "react";
import { QrScanner, deviceIdShort, parseDeviceQrPayload } from "../lib/qr";
import type { QrScanResult } from "../types";

interface Props {
  onResult: (result: QrScanResult) => void;
  onBack: () => void;
}

/**
 * Screen 2 — Device QR scanning.
 * Alignment frame, green highlight on success, a preview card
 * "Device: ESP32-XXXX" with a "Connect" button.
 */
export default function Scanner({ onResult, onBack }: Props) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameHint, setFrameHint] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [detected, setDetected] = useState<QrScanResult | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const hintShownRef = useRef(false);

  const handleDecoded = useCallback((res: QrScanResult) => {
    // Success highlight + stop the camera; "Connect" moves on.
    setDetected(res);
    void scannerRef.current?.stop();
  }, []);

  useEffect(() => {
    if (detected) return;
    let cancelled = false;
    const qr = new QrScanner();
    scannerRef.current = qr;
    qr.start(
      "qr-reader",
      (res) => {
        if (!cancelled) handleDecoded(res);
      },
      () => {
        if (!cancelled && !hintShownRef.current) {
          hintShownRef.current = true;
          setFrameHint("Point the camera at the device QR code");
        }
      },
    ).catch((err) => {
      if (!cancelled) setCameraError(err.message);
    });
    return () => {
      cancelled = true;
      void qr.stop();
    };
  }, [handleDecoded, detected]);

  const applyManual = () => {
    try {
      handleDecoded(parseDeviceQrPayload(manualText));
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
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
        <h1 className="text-lg font-bold text-ink">Scan</h1>
        <span className="w-16" />
      </div>

      {detected ? (
        /* Device preview after scanning */
        <div className="scan-success rounded-2xl border-2 border-axis-success bg-panel p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-axis-success/15 text-2xl">
              ⚡
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-ink">
                Device: ESP32-{deviceIdShort(detected.deviceId)}
              </p>
              <p className="truncate font-mono text-[10px] text-subtle">
                ID: {detected.deviceId.toBase58()}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-soft p-2 text-center text-[11px] text-mut">
            schema: {detected.payload.schema}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setDetected(null); setManualText(""); }}
              className="flex-1 rounded-xl border border-edge px-4 py-3 text-sm font-medium text-mut transition hover:bg-soft"
            >
              Scan again
            </button>
            <button
              onClick={() => onResult(detected)}
              className="flex-1 rounded-xl bg-axis-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
            >
              Connect
            </button>
          </div>
        </div>
      ) : cameraError ? (
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="text-sm text-axis-danger">{cameraError}</p>
          <p className="mt-2 text-xs text-mut">
            Make sure camera permission is granted and the page is served over HTTPS
            (or localhost).
          </p>
        </div>
      ) : (
        <div className="relative">
          <div
            id="qr-reader"
            className="overflow-hidden rounded-2xl border border-edge bg-black/60"
          />
          {/* Alignment frame */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div className="relative h-56 w-56">
              {[
                "top-0 left-0 border-t-4 border-l-4",
                "top-0 right-0 border-t-4 border-r-4",
                "bottom-0 left-0 border-b-4 border-l-4",
                "bottom-0 right-0 border-b-4 border-r-4",
              ].map((pos) => (
                <span key={pos} className={`absolute h-8 w-8 border-axis-accent ${pos}`} />
              ))}
            </div>
          </div>
        </div>
      )}
      {frameHint && !detected && !cameraError && (
        <p className="text-center text-[11px] text-subtle">{frameHint}</p>
      )}

      {/* Manual entry (fallback) */}
      {!detected && (
        <details className="rounded-2xl border border-edge bg-panel p-3">
          <summary className="cursor-pointer text-sm font-medium text-mut">
            Enter QR code manually
          </summary>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={3}
            placeholder='{"deviceId":"...","schema":"axis-energy-v1"}'
            className="mt-3 w-full rounded-xl border border-edge bg-surface p-3 font-mono text-xs text-ink outline-none focus:border-axis-accent"
          />
          <button
            onClick={applyManual}
            className="mt-2 w-full rounded-xl bg-axis-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Apply
          </button>
        </details>
      )}
    </div>
  );
}
