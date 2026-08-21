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
import type { TxRecord } from "../types";

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

/** ENRG SRC token Mint PDA: seeds = ["token-mint"], program = enrg_mvp. */
export async function getEnrgTokenMint(): Promise<PublicKey> {
  const [mint] = await PublicKey.findProgramAddress(
    [Buffer.from(TOKEN_MINT_SEED)],
    ENRG_PROGRAM_ID,
  );
  return mint;
}

/** User's Associated Token Account for a given mint (derived without spl-token). */
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
  /** Raw balance in atomic units. */
  raw: bigint;
  /** Formatted string with 9 decimal places. */
  formatted: string;
  /** Whether the ATA exists (otherwise the balance is zero). */
  hasAccount: boolean;
}

/** SRC (ENRG) token balance on the user's ATA. 0 if the ATA is not created yet. */
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

/** 123_456_789_123 atomic → "123.456789123" */
export function formatAtomic(raw: bigint): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const s = abs.toString().padStart(SRC_DECIMALS + 1, "0");
  const intPart = s.slice(0, -SRC_DECIMALS) || "0";
  const frac = s.slice(-SRC_DECIMALS).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${frac ? "." + frac : ""}`;
}

/**
 * The latest `limit` SRC accruals on the user's ATA.
 * Real data: getSignaturesForAddress(ATA) + parsed-transaction analysis
 * (post/pre tokenBalances). Returns an empty array on error/emptiness.
 */
export async function getRecentTokenTransfers(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  limit = 5,
): Promise<TxRecord[]> {
  try {
    const ata = await findAta(owner, mint);
    const sigs = await connection.getSignaturesForAddress(ata, { limit }, "confirmed");
    const records: TxRecord[] = [];

    for (const sig of sigs) {
      let tx;
      try {
        tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
      } catch {
        continue;
      }
      if (!tx || !tx.meta) continue;

      // Delta on the ATA from pre/post tokenBalances.
      const pre = tx.meta.preTokenBalances?.find(
        (b) => b.owner === owner.toBase58() && b.mint === mint.toBase58(),
      );
      const post = tx.meta.postTokenBalances?.find(
        (b) => b.owner === owner.toBase58() && b.mint === mint.toBase58(),
      );
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
      const delta = postAmount - preAmount;
      if (delta <= 0n) continue; // accruals only (not spendings)

      const isMint = tx.transaction.message.accountKeys.some(
        (k) => k.pubkey.equals(mint) && k.writable,
      );
      records.push({
        signature: sig.signature,
        amount: delta,
        timestamp: tx.blockTime ?? null,
        source: isMint ? "mint" : "transfer",
      });
    }
    return records.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Free SOL airdrop (devnet/localnet). Returns the signature.
 * Do NOT call on mainnet — the RPC will return an error.
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
