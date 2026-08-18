import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ENRG_PROGRAM_ID,
  SRC_DECIMALS,
  TOKEN_MINT_SEED,
  TOKEN_PROGRAM_ID,
} from "../config";

export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}

export async function getSolBalanceLamports(
  connection: Connection,
  owner: PublicKey,
): Promise<number> {
  try {
    return await connection.getBalance(owner, "confirmed");
  } catch {
    return 0;
  }
}

/** Mint PDA SRC-токена ENRG: seeds = ["token-mint"], program = enrg_mvp. */
export async function getEnrgTokenMint(): Promise<PublicKey> {
  const [mint] = await PublicKey.findProgramAddress(
    [Buffer.from(TOKEN_MINT_SEED)],
    ENRG_PROGRAM_ID,
  );
  return mint;
}

/** Associated Token Account пользователя для заданного mint (деривация без spl-token). */
export async function findAta(
  owner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  const [ata] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

export interface EnrgBalance {
  mint: PublicKey;
  /** Сырой остаток в атомарных единицах. */
  raw: bigint;
  /** Отформатированная строка с 9 десятичными знаками. */
  formatted: string;
  /** Существует ли ATA (иначе остаток нулевой). */
  hasAccount: boolean;
}

/** Баланс SRC (ENRG) токена на ATA пользователя. 0, если ATA ещё не создана. */
export async function getEnrgTokenBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<EnrgBalance> {
  const mint = await getEnrgTokenMint();
  const ata = await findAta(owner, mint);
  try {
    const info = await connection.getTokenAccountBalance(ata, "confirmed");
    const raw = BigInt(info.value.amount);
    return { mint, raw, formatted: formatAtomic(raw), hasAccount: true };
  } catch {
    return { mint, raw: 0n, formatted: "0", hasAccount: false };
  }
}

/** 123_456_789_123 атомар → "123.456789123" */
export function formatAtomic(raw: bigint): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const s = abs.toString().padStart(SRC_DECIMALS + 1, "0");
  const intPart = s.slice(0, -SRC_DECIMALS) || "0";
  const frac = s.slice(-SRC_DECIMALS).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${frac ? "." + frac : ""}`;
}

/**
 * Бесплатный airdrop SOL (devnet/localnet). Возвращает сигнатуру.
 * На mainnet не вызывать — вернёт ошибку RPC.
 */
export async function requestAirdrop(
  connection: Connection,
  to: PublicKey,
  sol = 1,
): Promise<string> {
  const signature = await connection.requestAirdrop(
    to,
    Math.round(sol * LAMPORTS_PER_SOL),
  );
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function getSlot(connection: Connection): Promise<number> {
  return connection.getSlot("confirmed");
}
