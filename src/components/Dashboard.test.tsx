import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { NETWORKS } from "../config";
import Dashboard from "./Dashboard";

// Recharts cannot measure the container in jsdom — replace with a stub.
vi.mock("recharts", () => {
  const React = require("react") as typeof import("react");
  const Dummy = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "chart" }, children);
  return {
    AreaChart: Dummy,
    Area: Dummy,
    XAxis: Dummy,
    YAxis: Dummy,
    Tooltip: Dummy,
    ResponsiveContainer: Dummy,
    CartesianGrid: Dummy,
  };
});

// html5-qrcode in jsdom — a stub (needed when rendering App; unused here).
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

const wallet = Keypair.generate();

function stubConnection(): Connection {
  return {
    getBalance: vi.fn().mockResolvedValue(1_000_000_000), // 1 SOL — gas is sufficient
    getAccountInfo: vi.fn().mockResolvedValue(null), // Producer PDA does not exist
    getTokenAccountBalance: vi.fn().mockRejectedValue(new Error("no ata")),
    getSignaturesForAddress: vi.fn().mockResolvedValue([]),
    getParsedTransaction: vi.fn().mockResolvedValue(null),
    getSlot: vi.fn().mockResolvedValue(100),
  } as unknown as Connection;
}

const baseProps = {
  pubkey: wallet.publicKey,
  connection: stubConnection(),
  network: NETWORKS[0],
  networks: NETWORKS,
  onConnectDevice: vi.fn(),
  onNetworkChange: vi.fn(),
  onOpenDevice: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe("Dashboard (energy)", () => {
  it("main metric is energy; SOL is hidden", async () => {
    render(<Dashboard {...baseProps} />);
    expect(await screen.findByText("Energy produced")).toBeInTheDocument();
    expect(screen.getAllByText(/kWh/).length).toBeGreaterThan(0);
    // SOL is not shown (gas is sufficient).
    expect(screen.queryByText(/Not enough SOL/)).not.toBeInTheDocument();
    // The add-device button is always visible.
    expect(screen.getByRole("button", { name: /Add device/ })).toBeInTheDocument();
  });

  it("empty states: no devices, no accruals, chart placeholder", async () => {
    render(<Dashboard {...baseProps} />);
    expect(await screen.findByText(/No devices yet/)).toBeInTheDocument();
    expect(screen.getByText(/No accruals yet/)).toBeInTheDocument();
    expect(
      screen.getByText(/Add a device — the production chart will appear here/),
    ).toBeInTheDocument();
    expect(screen.getByText("Current power")).toBeInTheDocument();
  });

  it("shows the SOL warning when gas is low", async () => {
    const conn = stubConnection();
    (conn.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(1_000_000); // 0.001 SOL
    render(<Dashboard {...baseProps} connection={conn} />);
    expect(await screen.findByText(/Not enough SOL/)).toBeInTheDocument();
  });

  it("device is shown as a card with a progress bar", async () => {
    const deviceId = wallet.publicKey.toBase58();
    localStorage.setItem(
      "axis-connect.devices.v1",
      JSON.stringify([{ deviceId, state: "Active", addedAt: Date.now() }]),
    );
    render(<Dashboard {...baseProps} />);
    expect(
      await screen.findByText(`ESP32-${deviceId.slice(-4).toUpperCase()}`),
    ).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
    expect(screen.getByText(/Today:/)).toBeInTheDocument();
  });

  it("CTA opens the scanner", async () => {
    const user = userEvent.setup();
    const onConnectDevice = vi.fn();
    render(<Dashboard {...baseProps} onConnectDevice={onConnectDevice} />);
    await user.click(screen.getByRole("button", { name: /Add device/ }));
    expect(onConnectDevice).toHaveBeenCalledTimes(1);
  });

  it("clicking a device opens its details", async () => {
    const user = userEvent.setup();
    const onOpenDevice = vi.fn();
    const deviceId = wallet.publicKey.toBase58();
    localStorage.setItem(
      "axis-connect.devices.v1",
      JSON.stringify([{ deviceId, state: "Active", addedAt: Date.now() }]),
    );
    render(<Dashboard {...baseProps} onOpenDevice={onOpenDevice} />);
    const btn = await screen.findByRole("button", {
      name: new RegExp(`ESP32-${deviceId.slice(-4).toUpperCase()}`),
    });
    await user.click(btn);
    expect(onOpenDevice).toHaveBeenCalledWith(deviceId);
  });
});
