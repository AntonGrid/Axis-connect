import { describe, expect, it, vi, afterEach } from "vitest";
import {
  connectInjectedWallet,
  detectInjectedWallet,
  hasInjectedWallet,
  providerKind,
} from "./walletProvider";

/**
 * P2-3 (audit 2026-08-30): injected wallet provider detection.
 * The PWA should not store a real-value signing key in localStorage; this
 * module is the first step toward extension-based signing.
 */

function fakeProvider(overrides: Record<string, unknown> = {}) {
  return {
    isPhantom: true,
    isConnected: false,
    publicKey: { toBase58: () => "Pk11111111111111111111111111111111111111111" },
    connect: vi.fn(async () => ({
      publicKey: { toBase58: () => "Pk11111111111111111111111111111111111111111" },
    })),
    disconnect: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeWindow(provider: unknown): Window {
  const win = { phantom: { solana: provider } } as unknown as Window;
  return win;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("walletProvider (P2-3)", () => {
  it("detects a Phantom provider and classifies it", () => {
    const win = fakeWindow(fakeProvider());
    const provider = detectInjectedWallet(win);
    expect(provider).not.toBeNull();
    expect(providerKind(provider)).toBe("phantom");
  });

  it("returns null when no wallet is injected", () => {
    const win = {} as Window;
    expect(detectInjectedWallet(win)).toBeNull();
    expect(providerKind(detectInjectedWallet(win))).toBe("none");
    expect(hasInjectedWallet(win)).toBe(false);
  });

  it("connects and returns the base58 public key", async () => {
    const provider = fakeProvider();
    const win = fakeWindow(provider);
    const pk = await connectInjectedWallet(detectInjectedWallet(win)!);
    expect(pk).toBe("Pk11111111111111111111111111111111111111111");
    expect(provider.connect).toHaveBeenCalled();
  });

  it("returns null on connect failure (user cancel)", async () => {
    const provider = fakeProvider({
      connect: vi.fn(async () => {
        throw new Error("user rejected");
      }),
    });
    const win = fakeWindow(provider);
    expect(await connectInjectedWallet(detectInjectedWallet(win)!)).toBeNull();
  });

  it("reuses an already-connected session without calling connect()", async () => {
    const provider = fakeProvider({ isConnected: true });
    const win = fakeWindow(provider);
    const pk = await connectInjectedWallet(detectInjectedWallet(win)!);
    expect(pk).toBe("Pk11111111111111111111111111111111111111111");
    expect(provider.connect).not.toHaveBeenCalled();
  });
});
