import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { MANIFEST_REGISTRY_SEED, MANIFEST_VERIFICATION_SEED, SYSVAR_INSTRUCTIONS_ID } from "../config";
import enrgIdl from "../data/enrg_mvp.json";
import { ascii, concatBytes, u8 } from "./borsh";

/**
 * Модуль издателя манифестов: on-chain `register_manifest_verification`.
 *
 * ⚠️ ВАЖНО: это инструкция ДОВЕРЕННОГО ИЗДАТЕЛЯ (оракула/админа), а НЕ шаг
 * пользовательского онбординга. Контракт (версия Антона) требует:
 *   1) publisher (signer) == ManifestRegistry.oracle_authority;
 *   2) валидную Ed25519-подпись издателя над каноническим сообщением
 *      b"enrg:manifest" || manifest_id(16) || content_hash(32) || version(1),
 *      предъявленную через ed25519-precompile-инструкцию (sysvar Instructions).
 *
 * Аккаунты (как в instructions/manifest_verification.rs):
 *   verification (init PDA [b"manifest-verification", manifest_id]),
 *   registry     (PDA [b"manifest-registry"]),
 *   publisher    (Signer, writable),
 *   instructions (sysvar),
 *   system_program.
 */

// ── Публичные PDA-деривации ──

export function manifestRegistryPdaSync(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MANIFEST_REGISTRY_SEED)],
    programId,
  );
  return pda;
}

export function manifestVerificationPdaSync(
  programId: PublicKey,
  manifestId: Uint8Array,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MANIFEST_VERIFICATION_SEED), Buffer.from(manifestId)],
    programId,
  );
  return pda;
}

// ── Каноническое сообщение издателя (зеркалит manifest_verification.rs) ──

const MANIFEST_SIGN_PREFIX = ascii("enrg:manifest");

export function manifestSignMessage(
  manifestId: Uint8Array, // 16 байт
  contentHash: Uint8Array, // 32 байта
  manifestVersion: number, // u8
): Uint8Array {
  if (manifestId.length !== 16) throw new Error("manifestId: ожидается 16 байт");
  if (contentHash.length !== 32) throw new Error("contentHash: ожидается 32 байта");
  return concatBytes(MANIFEST_SIGN_PREFIX, manifestId, contentHash, u8(manifestVersion));
}

// ── Строитель инструкции (аргументы и аккаунты по IDL) ──

export interface ManifestVerificationArgs {
  manifestId: Uint8Array; // [u8; 16]
  publisherKey: Uint8Array; // [u8; 32]
  contentHash: Uint8Array; // [u8; 32]
  signature: Uint8Array; // [u8; 64]
  manifestVersion: number; // u8
}

interface IdlIx {
  name: string;
  discriminator: number[];
  accounts: Array<{ name: string; signer?: boolean; writable?: boolean }>;
}
interface EnrgIdl {
  instructions: IdlIx[];
}

function discriminatorOf(ixName: string): Uint8Array {
  const idl = enrgIdl as unknown as EnrgIdl;
  const ix = idl.instructions.find((i) => i.name === ixName);
  if (!ix) throw new Error(`Инструкция отсутствует в IDL: ${ixName}`);
  return Uint8Array.from(ix.discriminator);
}

export function buildRegisterManifestVerificationIx(
  programId: PublicKey,
  accounts: {
    verification: PublicKey;
    registry: PublicKey;
    publisher: PublicKey;
  },
  args: ManifestVerificationArgs,
): TransactionInstruction {
  const keys = [
    { pubkey: accounts.verification, isSigner: false, isWritable: true },
    { pubkey: accounts.registry, isSigner: false, isWritable: false },
    { pubkey: accounts.publisher, isSigner: true, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS_ID, isSigner: false, isWritable: false },
    { pubkey: PublicKey.default, isSigner: false, isWritable: false },
  ];
  const data = concatBytes(
    discriminatorOf("register_manifest_verification"),
    args.manifestId,
    args.publisherKey,
    args.contentHash,
    args.signature,
    u8(args.manifestVersion),
  );
  return new TransactionInstruction({ keys, programId, data: Buffer.from(data) });
}
