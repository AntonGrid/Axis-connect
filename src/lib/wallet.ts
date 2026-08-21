import { Keypair, PublicKey } from "@solana/web3.js";
import { STORAGE_KEYS } from "../config";
import { base58Decode, base58Encode, base64ToBytes, bytesToBase64 } from "./encoding";

interface StoredWallet {
  version: 1;
  /** Secret key (64 bytes: 32 seed + 32 pubkey) in base64. */
  secretKeyBase64: string;
  createdAt: number;
}

/**
 * Non-custodial wallet: the Ed25519 keypair is generated locally and stored
 * ONLY in the browser localStorage. The private key never leaves the device.
 */
export function createWallet(): Keypair {
  const keypair = Keypair.generate();
  saveWallet(keypair);
  return keypair;
}

export function loadWallet(): Keypair | null {
  const raw = localStorage.getItem(STORAGE_KEYS.wallet);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredWallet;
    if (parsed.version !== 1) return null;
    const secret = base64ToBytes(parsed.secretKeyBase64);
    return Keypair.fromSecretKey(secret);
  } catch {
    // Broken key — treat as no wallet (don't throw because of garbage).
    localStorage.removeItem(STORAGE_KEYS.wallet);
    return null;
  }
}

export function saveWallet(keypair: Keypair): void {
  const stored: StoredWallet = {
    version: 1,
    secretKeyBase64: bytesToBase64(keypair.secretKey),
    createdAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEYS.wallet, JSON.stringify(stored));
}

export function deleteWallet(): void {
  localStorage.removeItem(STORAGE_KEYS.wallet);
}

export function getWalletPublicKey(): PublicKey | null {
  return loadWallet()?.publicKey ?? null;
}

/** Export the secret key in base58 (like Phantom/native wallets). */
export function exportSecretBase58(keypair: Keypair): string {
  return base58Encode(keypair.secretKey);
}

/** Restore a wallet from a base58 secret (64 bytes). */
export function importWalletFromSecretBase58(secretBase58: string): Keypair {
  const secret = base58Decode(secretBase58.trim());
  if (secret.length !== 64) {
    throw new Error(
      `Invalid key length: expected 64 bytes, got ${secret.length}`,
    );
  }
  const keypair = Keypair.fromSecretKey(secret);
  saveWallet(keypair);
  return keypair;
}

/** Utility: load the wallet creation time (by name, just in case). */
export function loadWalletCreatedAt(): number | null {
  const raw = localStorage.getItem(STORAGE_KEYS.wallet);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as StoredWallet).createdAt;
  } catch {
    return null;
  }
}
