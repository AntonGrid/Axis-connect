import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { NETWORKS } from "../config";
import Dashboard from "./Dashboard";

// Recharts в jsdom не может измерить контейнер — заменяем на заглушку.
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

// html5-qrcode в jsdom — заглушка (нужна при рендере App, здесь не используется).
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
    getBalance: vi.fn().mockResolvedValue(1_000_000_000), // 1 SOL — газа хватает
    getAccountInfo: vi.fn().mockResolvedValue(null), // Producer PDA не существует
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

describe("Dashboard (энергетический дашборд)", () => {
  it("главная метрика — энергия; SOL скрыт", async () => {
    render(<Dashboard {...baseProps} />);
    expect(await screen.findByText("Выработано энергии")).toBeInTheDocument();
    expect(screen.getAllByText(/кВт·ч/).length).toBeGreaterThan(0);
    // SOL не показывается (газа хватает).
    expect(screen.queryByText(/Недостаточно SOL/)).not.toBeInTheDocument();
    // Кнопка добавления устройства всегда видна.
    expect(screen.getByRole("button", { name: /Добавить устройство/ })).toBeInTheDocument();
  });

  it("пустые состояния: нет устройств, нет начислений, placeholder графика", async () => {
    render(<Dashboard {...baseProps} />);
    expect(await screen.findByText(/Пока нет устройств/)).toBeInTheDocument();
    expect(screen.getByText(/Начислений пока нет/)).toBeInTheDocument();
    expect(
      screen.getByText(/Добавьте устройство — здесь появится график выработки/),
    ).toBeInTheDocument();
    expect(screen.getByText("Текущая мощность")).toBeInTheDocument();
  });

  it("показывает SOL-предупреждение при нехватке газа", async () => {
    const conn = stubConnection();
    (conn.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(1_000_000); // 0.001 SOL
    render(<Dashboard {...baseProps} connection={conn} />);
    expect(await screen.findByText(/Недостаточно SOL/)).toBeInTheDocument();
  });

  it("устройство отображается карточкой с прогресс-баром", async () => {
    const deviceId = wallet.publicKey.toBase58();
    localStorage.setItem(
      "axis-connect.devices.v1",
      JSON.stringify([{ deviceId, state: "Active", addedAt: Date.now() }]),
    );
    render(<Dashboard {...baseProps} />);
    expect(
      await screen.findByText(`ESP32-${deviceId.slice(-4).toUpperCase()}`),
    ).toBeInTheDocument();
    expect(screen.getByText("оффлайн")).toBeInTheDocument();
    expect(screen.getByText(/Сегодня:/)).toBeInTheDocument();
  });

  it("CTA открывает сканер", async () => {
    const user = userEvent.setup();
    const onConnectDevice = vi.fn();
    render(<Dashboard {...baseProps} onConnectDevice={onConnectDevice} />);
    await user.click(screen.getByRole("button", { name: /Добавить устройство/ }));
    expect(onConnectDevice).toHaveBeenCalledTimes(1);
  });

  it("клик по устройству открывает детали", async () => {
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
