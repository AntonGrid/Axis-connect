import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

describe("Onboarding", () => {
  it("shows hero with tagline and buttons", () => {
    render(<Onboarding onCreated={() => {}} />);
    expect(screen.getByText(/Connect your device in 10 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create wallet/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import wallet/ })).toBeInTheDocument();
  });

  it("create wallet → backup screen → continue calls onCreated", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<Onboarding onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /Create wallet/ }));
    expect(screen.getByText(/Wallet created/)).toBeInTheDocument();
    expect(screen.getByText(/Secret key/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("import wallet with invalid secret shows error", async () => {
    const user = userEvent.setup();
    render(<Onboarding onCreated={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Import wallet/ }));
    await user.type(screen.getByPlaceholderText(/Secret key base58/), "123");
    await user.click(screen.getByRole("button", { name: /Restore/ }));

    expect(screen.getByText(/Invalid key length/)).toBeInTheDocument();
  });
});
