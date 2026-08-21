import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { MANIFEST_REGISTRY_SEED, MANIFEST_VERIFICATION_SEED, SYSVAR_INSTRUCTIONS_ID } from "../config";
import enrgIdl from "../data/enrg_mvp.json";
import { ascii, concatBytes, u8 } from "./borsh";

/**
 * Manifest publisher module: on-chain `register_manifest_verification`.
 *
 * ⚠️ IMPORTANT: this is a TRUSTED PUBLISHER (oracle/admin) instruction, NOT a
 * user-onboarding step. The contract requires:
 *   1) publisher (signer) == ManifestRegistry.oracle_authority;
 *   2) a valid Ed25519 publisher signature over the canonical message
 *      b"enrg:manifest" || manifest_id(16) || content_hash(32) || version(1),
 *      presented via the ed25519-precompile instruction (sysvar Instructions).
 *
 * Accounts (as in instructions/manifest_verification.rs):
 *   verification (init PDA [b"manifest-verification", manifest_id]),
 *   registry     (PDA [b"manifest-registry"]),
 *   publisher    (Signer, writable),
 *   instructions (sysvar),
 *   system_program.
 */

// ── Public PDA derivations ──

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

// ── Publisher canonical message (mirrors manifest_verification.rs) ──

const MANIFEST_SIGN_PREFIX = ascii("enrg:manifest");

export function manifestSignMessage(
  manifestId: Uint8Array, // 16 bytes
  contentHash: Uint8Array, // 32 bytes
  manifestVersion: number, // u8
): Uint8Array {
  if (manifestId.length !== 16) throw new Error("manifestId: expected 16 bytes");
  if (contentHash.length !== 32) throw new Error("contentHash: expected 32 bytes");
  return concatBytes(MANIFEST_SIGN_PREFIX, manifestId, contentHash, u8(manifestVersion));
}

// ── Instruction builder (arguments and accounts per the IDL) ──

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
  if (!ix) throw new Error(`Instruction not found in IDL: ${ixName}`);
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
