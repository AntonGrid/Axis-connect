import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

describe("Onboarding", () => {
  it("shows hero with tagline and buttons", () => {
    render(<Onboarding onCreated={() => {}} />);
    expect(screen.getByText(/Подключите устройство за 10 секунд/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать кошелёк/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Импортировать кошелёк/ })).toBeInTheDocument();
  });

  it("create wallet → backup screen → continue calls onCreated", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<Onboarding onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /Создать кошелёк/ }));
    expect(screen.getByText(/Кошелёк создан/)).toBeInTheDocument();
    expect(screen.getByText(/Секретный ключ/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Продолжить/ }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("import wallet with invalid secret shows error", async () => {
    const user = userEvent.setup();
    render(<Onboarding onCreated={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Импортировать кошелёк/ }));
    await user.type(screen.getByPlaceholderText(/Секретный ключ base58/), "123");
    await user.click(screen.getByRole("button", { name: /Восстановить/ }));

    expect(screen.getByText(/Неверная длина ключа/)).toBeInTheDocument();
  });
});
