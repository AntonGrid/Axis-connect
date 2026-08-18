import { PublicKey } from "@solana/web3.js";
import type { NetworkConfig, NetworkId } from "./types";

/** Program ID смарт-контракта ENRG (enrg_mvp). Источник: ENRG/Anchor.toml. */
export const ENRG_PROGRAM_ID = new PublicKey(
  "HkuC3FTGAf9ryPqH7fi3RbUHwP4TKFMg5WgHNWm6Vaxb",
);

/** Десятичные знаки SRC-токена (v7.0 §17). */
export const SRC_DECIMALS = 9;

// ── Seeds PDA (зеркалируют constants/enrg_mvp, tests/helpers/pda.ts) ──
export const TOKEN_MINT_SEED = "token-mint";
export const PRODUCER_SEED = "producer";
export const OWNER_DEVICES_SEED = "owner-devices";
export const MANIFEST_REGISTRY_SEED = "manifest-registry";
export const MANIFEST_VERIFICATION_SEED = "manifest-verification";

// ── Системные программы / sysvars ──
export const SYSTEM_PROGRAM_ID = PublicKey.default; // SystemProgram.programId == 111...
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const SYSVAR_INSTRUCTIONS_ID = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111",
);

// ── Локальный HTTP-signer прошивки (Phase 3) ──
export const DEVICE_SIGNER_PORT = 8080;
/** Таймаут запросов к девайсу по локальной сети. */
export const DEVICE_SIGNER_TIMEOUT_MS = 1500;

// ── Сети ──
export const NETWORKS: NetworkConfig[] = [
  {
    id: "devnet",
    label: "Devnet",
    rpcUrl: "https://api.devnet.solana.com",
    airdrop: true,
  },
  {
    id: "localnet",
    label: "Localnet",
    rpcUrl: "http://127.0.0.1:8899",
    airdrop: true,
  },
  {
    id: "mainnet",
    label: "Mainnet (beta)",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    airdrop: false,
  },
];

export function networkById(id: NetworkId): NetworkConfig {
  const n = NETWORKS.find((it) => it.id === id);
  if (!n) throw new Error(`Unknown network: ${id}`);
  return n;
}

export const DEFAULT_NETWORK_ID: NetworkId = "devnet";

/** Ключи LocalStorage. */
export const STORAGE_KEYS = {
  wallet: "axis-connect.wallet.v1",
  network: "axis-connect.network.v1",
  registeredDevices: "axis-connect.devices.v1",
} as const;
