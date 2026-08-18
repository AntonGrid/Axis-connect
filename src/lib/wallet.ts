import { Keypair, PublicKey } from "@solana/web3.js";
import { STORAGE_KEYS } from "../config";
import { base58Decode, base58Encode, base64ToBytes, bytesToBase64 } from "./encoding";

interface StoredWallet {
  version: 1;
  /** Секретный ключ (64 байта: 32 seed + 32 pubkey) в base64. */
  secretKeyBase64: string;
  createdAt: number;
}

/**
 * Некастодиальный кошелёк: Ed25519 Keypair генерируется локально и хранится
 * ТОЛЬКО в localStorage браузера. Закрытый ключ никогда не покидает устройство.
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
    // Битый ключ — считаем, что кошелька нет (не выбрасываем из-за мусора).
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

/** Экспорт секретного ключа в формате base58 (как Phantom/нативные кошельки). */
export function exportSecretBase58(keypair: Keypair): string {
  return base58Encode(keypair.secretKey);
}

/** Восстановление кошелька из base58-секрета (64 байта). */
export function importWalletFromSecretBase58(secretBase58: string): Keypair {
  const secret = base58Decode(secretBase58.trim());
  if (secret.length !== 64) {
    throw new Error(
      `Неверная длина ключа: ожидается 64 байта, получено ${secret.length}`,
    );
  }
  const keypair = Keypair.fromSecretKey(secret);
  saveWallet(keypair);
  return keypair;
}

/** Служебное: на всякий случай поимённо загрузить время создания. */
export function loadWalletCreatedAt(): number | null {
  const raw = localStorage.getItem(STORAGE_KEYS.wallet);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as StoredWallet).createdAt;
  } catch {
    return null;
  }
}
