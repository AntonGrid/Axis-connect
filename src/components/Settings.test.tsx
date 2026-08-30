import { Keypair } from "@solana/web3.js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NETWORKS } from "../config";
import Settings from "./Settings";

const keypair = Keypair.generate();
const wallet = { kind: "local" as const, keypair };
const baseProps = {
  wallet,
  networks: NETWORKS,
  network: NETWORKS[0],
  theme: "dark" as const,
  onNetworkChange: vi.fn(),
  onThemeChange: vi.fn(),
  onDeleteWallet: vi.fn(),
  onConnectInjected: vi.fn(async () => null),
  onBack: vi.fn(),
};

describe("Settings", () => {
  it("shows wallet address", () => {
    render(<Settings {...baseProps} />);
    expect(screen.getByText(wallet.keypair.publicKey.toBase58())).toBeInTheDocument();
  });

  it("theme toggle calls onThemeChange with next mode", async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    render(<Settings {...baseProps} onThemeChange={onThemeChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("export key reveals secret after click", async () => {
    const user = userEvent.setup();
    render(<Settings {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Export private key/ }));
    expect(screen.getByText(/full access to your funds/)).toBeInTheDocument();
  });

  it("delete wallet requires confirmation", async () => {
    const user = userEvent.setup();
    const onDeleteWallet = vi.fn();
    render(<Settings {...baseProps} onDeleteWallet={onDeleteWallet} />);
    await user.click(screen.getByRole("button", { name: /Delete wallet/ }));
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    expect(onDeleteWallet).toHaveBeenCalledTimes(1);
  });

  it("connects an injected browser wallet (P2-3)", async () => {
    // Mock a Phantom provider on the window so the Connect button appears.
    const connectMock = vi.fn(async () => ({
      publicKey: { toBase58: () => "PhantomPk111111111111111111111111111111111111" },
    }));
    (window as Window & { phantom?: unknown }).phantom = {
      solana: { isPhantom: true, connect: connectMock },
    };
    const user = userEvent.setup();
    const onConnectInjected = vi.fn(async () => "PhantomPk111111111111111111111111111111111111");
    render(<Settings {...baseProps} onConnectInjected={onConnectInjected} />);
    await user.click(screen.getByRole("button", { name: /Connect Phantom/ }));
    expect(onConnectInjected).toHaveBeenCalledTimes(1);
    delete (window as Window & { phantom?: unknown }).phantom;
  });

  it("hides the private-key export for an injected wallet", () => {
    render(
      <Settings
        {...baseProps}
        wallet={{ kind: "injected", provider: { isPhantom: true }, publicKey: keypair.publicKey }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Export private key/ })).not.toBeInTheDocument();
  });
});
