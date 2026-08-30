/**
 * Browser-wallet provider abstraction (P2-3, audit 2026-08-30).
 *
 * The PWA currently keeps the signing keypair in localStorage (XSS-risky for
 * real value). This module detects a standard injected wallet (Phantom /
 * Solflare / any `window.*.solana` with a `connect()` + `publicKey` shape) and
 * normalizes it into a minimal adapter interface, so transaction signing can
 * move to the extension without the key ever touching the page's storage.
 *
 * Integration status: provider detection + normalization are ready and
 * unit-tested; wiring it into App/Settings/enrgTx is the next step.
 */

export interface InjectedWalletLike {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  publicKey?: { toBase58(): string };
  connect?: (opts?: unknown) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }>;
}

export type WalletProviderKind = "phantom" | "solflare" | "injected" | "none";

/** Returns the injected wallet adapter if any is present in the window. */
export function detectInjectedWallet(win: Window | undefined = window): InjectedWalletLike | null {
  if (!win) return null;
  const w = win as Window & {
    phantom?: { solana?: InjectedWalletLike };
    solflare?: InjectedWalletLike;
  };
  const phantom = w.phantom?.solana;
  if (phantom && typeof phantom.connect === "function") return phantom;
  if (w.solflare && typeof w.solflare.connect === "function") return w.solflare;
  // Any other provider exposing the standard shape.
  const injected = (win as unknown as Record<string, unknown>)[
    "solana"
  ] as InjectedWalletLike | undefined;
  if (injected && typeof injected.connect === "function") return injected;
  return null;
}

export function providerKind(provider: InjectedWalletLike | null): WalletProviderKind {
  if (!provider) return "none";
  if (provider.isPhantom) return "phantom";
  if (provider.isSolflare) return "solflare";
  return "injected";
}

/** Connects and returns the base58 public key, or null on failure/cancel. */
export async function connectInjectedWallet(
  provider: InjectedWalletLike,
): Promise<string | null> {
  try {
    if (provider.isConnected && provider.publicKey) {
      return provider.publicKey.toBase58();
    }
    if (!provider.connect) return null;
    const res = await provider.connect();
    return res?.publicKey?.toBase58() ?? null;
  } catch {
    return null; // user cancelled / provider error
  }
}

/** True when an injected wallet is available (used by the Settings screen). */
export function hasInjectedWallet(win: Window | undefined = window): boolean {
  return detectInjectedWallet(win) !== null;
}
