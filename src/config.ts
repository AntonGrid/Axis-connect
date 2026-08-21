import { PublicKey } from "@solana/web3.js";
import type { NetworkConfig, NetworkId } from "./types";

/** ENRG smart-contract program id (enrg_mvp). Source: ENRG/Anchor.toml. */
export const ENRG_PROGRAM_ID = new PublicKey(
  "HkuC3FTGAf9ryPqH7fi3RbUHwP4TKFMg5WgHNWm6Vaxb",
);

/** SRC token decimals (v7.0 §17). */
export const SRC_DECIMALS = 9;

// ── PDA seeds (mirror constants/enrg_mvp and tests/helpers/pda.ts) ──
export const TOKEN_MINT_SEED = "token-mint";
export const PRODUCER_SEED = "producer";
export const OWNER_DEVICES_SEED = "owner-devices";
export const MANIFEST_REGISTRY_SEED = "manifest-registry";
export const MANIFEST_VERIFICATION_SEED = "manifest-verification";

// ── System programs / sysvars ──
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

// ── Firmware local HTTP-signer (Phase 3) ──
export const DEVICE_SIGNER_PORT = 8080;
/** Timeout for local-network requests to the device. */
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

/** LocalStorage keys. */
export const STORAGE_KEYS = {
  wallet: "axis-connect.wallet.v1",
  network: "axis-connect.network.v1",
  registeredDevices: "axis-connect.devices.v1",
  theme: "axis-connect.theme.v1",
} as const;

/** Energy-history key prefix: axis-connect.energy.v1.<deviceId> */
export const ENERGY_HISTORY_KEY_PREFIX = "axis-connect.energy.v1.";
/** How many energy snapshots to keep per device (24h at a 15-min period). */
export const ENERGY_HISTORY_MAX_POINTS = 192;
/** Device polling interval for snapshots (ms) — while the device is online. */
export const ENERGY_POLL_INTERVAL_MS = 15 * 60 * 1000;

