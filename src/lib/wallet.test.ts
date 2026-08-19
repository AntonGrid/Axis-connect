import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  createWallet,
  deleteWallet,
  exportSecretBase58,
  importWalletFromSecretBase58,
  loadWallet,
} from "../lib/wallet";
import { STORAGE_KEYS } from "../config";

describe("wallet (non-custodial, localStorage)", () => {
  it("createWallet persists to localStorage and loads back with same pubkey", () => {
    const kp = createWallet();
    expect(localStorage.getItem(STORAGE_KEYS.wallet)).not.toBeNull();
    const loaded = loadWallet();
    expect(loaded?.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it("export/import round-trip via base58 secret", () => {
    const kp = createWallet();
    const secret = exportSecretBase58(kp);
    deleteWallet();
    expect(loadWallet()).toBeNull();
    const restored = importWalletFromSecretBase58(secret);
    expect(restored.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it("rejects invalid secret length", () => {
    expect(() => importWalletFromSecretBase58("123")).toThrow();
  });

  it("deleteWallet removes key", () => {
    createWallet();
    deleteWallet();
    expect(loadWallet()).toBeNull();
  });

  it("keypair generated locally is a valid Ed25519 keypair", () => {
    const kp = createWallet();
    expect(kp.secretKey).toHaveLength(64);
    expect(kp.publicKey.toBytes()).toHaveLength(32);
    void Keypair;
  });
});
