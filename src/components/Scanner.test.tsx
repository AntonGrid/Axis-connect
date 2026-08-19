import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Scanner from "./Scanner";
import { deviceIdShort } from "../lib/qr";
import type { QrScanResult } from "../types";

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    isScanning = false;
    async start() {}
    async stop() {
      this.isScanning = false;
    }
    clear() {}
  },
}));

const DEVICE_BASE58 = "AxJsXqX9YxD3pz2w7e7cJdQpP7oFg9vHsE9kX2vYjWmN";
const PAYLOAD = JSON.stringify({
  deviceId: DEVICE_BASE58,
  schema: "axis-energy-v1",
});

describe("Scanner", () => {
  it("ручной ввод QR → превью устройства → Подключить", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Scanner onResult={onResult} onBack={() => {}} />);

    // Открыть ручной ввод и вставить пейлоад (paste — корректно работает с {}/:).
    await user.click(screen.getByText(/Ввести QR-код вручную/));
    const input = screen.getByPlaceholderText(/deviceId/);
    await user.click(input);
    await user.paste(PAYLOAD);
    await user.click(screen.getByRole("button", { name: /Применить/ }));

    // Превью устройства: суффикс — последние 4 hex deviceId (как в прошивке).
    const pk = deviceIdShort(new (require("@solana/web3.js").PublicKey)(DEVICE_BASE58));
    expect(await screen.findByText(new RegExp(`Устройство: ESP32-${pk}`))).toBeInTheDocument();
    expect(screen.getByText(/axis-energy-v1/)).toBeInTheDocument();

    // Кнопка «Подключить» отдаёт результат.
    await user.click(screen.getByRole("button", { name: /Подключить/ }));
    expect(onResult).toHaveBeenCalledTimes(1);
    const res = onResult.mock.calls[0][0] as QrScanResult;
    expect(res.deviceId.toBase58()).toBe(DEVICE_BASE58);
  });

  it("невалидный ввод показывает ошибку", async () => {
    const user = userEvent.setup();
    render(<Scanner onResult={() => {}} onBack={() => {}} />);
    await user.click(screen.getByText(/Ввести QR-код вручную/));
    await user.type(screen.getByPlaceholderText(/deviceId/), "not json");
    await user.click(screen.getByRole("button", { name: /Применить/ }));
    expect(await screen.findByText(/не содержит валидный JSON/)).toBeInTheDocument();
  });
});

