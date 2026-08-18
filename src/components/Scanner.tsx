import { useCallback, useEffect, useRef, useState } from "react";
import { QrScanner, parseDeviceQrPayload } from "../lib/qr";
import type { QrScanResult } from "../types";

interface Props {
  onResult: (result: QrScanResult) => void;
  onBack: () => void;
}

/**
 * Экран 2 — Сканирование QR-кода устройства.
 * Открывает камеру смартфона (html5-qrcode), парсит JSON
 * { "deviceId": "...", "schema": "axis-energy-v1" }.
 */
export default function Scanner({ onResult, onBack }: Props) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameHint, setFrameHint] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const scannerRef = useRef<QrScanner | null>(null);
  // Показываем подсказку только один раз — через ref, чтобы не перезапускать
  // сканер (html5-qrcode зовёт error-колбэк на каждом кадре без QR).
  const hintShownRef = useRef(false);

  const handleDecoded = useCallback(
    (res: QrScanResult) => {
      // Останавливаем камеру до перехода на следующий экран.
      void scannerRef.current?.stop();
      onResult(res);
    },
    [onResult],
  );

  useEffect(() => {
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
          setFrameHint("Камера работает — наведите на QR-код");
        }
      },
    ).catch((err) => {
      if (!cancelled) setCameraError(err.message);
    });
    return () => {
      cancelled = true;
      void qr.stop();
    };
  }, [handleDecoded]);

  const applyManual = () => {
    try {
      const res = parseDeviceQrPayload(manualText);
      handleDecoded(res);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-xl border border-axis-border px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          ← Назад
        </button>
        <h1 className="text-lg font-bold text-white">Сканирование</h1>
        <span className="w-16" />
      </div>

      <p className="text-sm text-slate-400">
        Наведите камеру на QR-код устройства (наклейка/экран). Формат:{" "}
        <code className="text-axis-accent">{"{ deviceId, schema }"}</code>
      </p>

      {cameraError ? (
        <div className="rounded-2xl border border-axis-border bg-axis-panel p-4">
          <p className="text-sm text-axis-danger">{cameraError}</p>
          <p className="mt-2 text-xs text-slate-400">
            Убедитесь, что разрешение на камеру выдано и страница открыта по HTTPS
            (или localhost). На телефоне: <code>npm run dev:https</code> и откройте
            приложение по LAN-адресу с https.
          </p>
        </div>
      ) : (
        <div id="qr-reader" className="overflow-hidden rounded-2xl border border-axis-border bg-black/60" />
      )}
      {frameHint && !cameraError && (
        <p className="text-center text-[11px] text-slate-600">
          Камера работает — наведите на QR-код
        </p>
      )}

      {/* Ручной ввод (fallback) */}
      <details className="rounded-2xl border border-axis-border bg-axis-panel p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Ввести QR-код вручную
        </summary>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          rows={3}
          placeholder='{"deviceId":"...","schema":"axis-energy-v1"}'
          className="mt-3 w-full rounded-xl border border-axis-border bg-black/40 p-3 font-mono text-xs text-slate-200 outline-none focus:border-axis-accent"
        />
        <button
          onClick={applyManual}
          className="mt-2 w-full rounded-xl bg-axis-accent px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
        >
          Применить
        </button>
      </details>
    </div>
  );
}
