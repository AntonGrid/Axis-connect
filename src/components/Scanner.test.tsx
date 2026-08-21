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
  it("manual QR entry → device preview → Connect", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Scanner onResult={onResult} onBack={() => {}} />);

    // Open manual entry and paste the payload (paste works correctly with {} / :).
    await user.click(screen.getByText(/Enter QR code manually/));
    const input = screen.getByPlaceholderText(/deviceId/);
    await user.click(input);
    await user.paste(PAYLOAD);
    await user.click(screen.getByRole("button", { name: /Apply/ }));

    // Device preview: the suffix is the last 4 hex chars of deviceId (as in the firmware).
    const pk = deviceIdShort(new (require("@solana/web3.js").PublicKey)(DEVICE_BASE58));
    expect(await screen.findByText(new RegExp(`Device: ESP32-${pk}`))).toBeInTheDocument();
    expect(screen.getByText(/axis-energy-v1/)).toBeInTheDocument();

    // The "Connect" button returns the result.
    await user.click(screen.getByRole("button", { name: /Connect/ }));
    expect(onResult).toHaveBeenCalledTimes(1);
    const res = onResult.mock.calls[0][0] as QrScanResult;
    expect(res.deviceId.toBase58()).toBe(DEVICE_BASE58);
  });

  it("invalid input shows an error", async () => {
    const user = userEvent.setup();
    render(<Scanner onResult={() => {}} onBack={() => {}} />);
    await user.click(screen.getByText(/Enter QR code manually/));
    await user.type(screen.getByPlaceholderText(/deviceId/), "not json");
    await user.click(screen.getByRole("button", { name: /Apply/ }));
    expect(await screen.findByText(/does not contain valid JSON/)).toBeInTheDocument();
  });
});

