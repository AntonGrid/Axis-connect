import { Keypair } from "@solana/web3.js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NETWORKS } from "../config";
import Settings from "./Settings";

const wallet = Keypair.generate();
const baseProps = {
  wallet,
  networks: NETWORKS,
  network: NETWORKS[0],
  theme: "dark" as const,
  onNetworkChange: vi.fn(),
  onThemeChange: vi.fn(),
  onDeleteWallet: vi.fn(),
  onBack: vi.fn(),
};

describe("Settings", () => {
  it("shows wallet address", () => {
    render(<Settings {...baseProps} />);
    expect(screen.getByText(wallet.publicKey.toBase58())).toBeInTheDocument();
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
});
