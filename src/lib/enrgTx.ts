import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import enrgIdl from "../data/enrg_mvp.json";
import { ENRG_PROGRAM_ID, OWNER_DEVICES_SEED, PRODUCER_SEED, SYSVAR_INSTRUCTIONS_ID } from "../config";
import type { DeviceState, EnergyProducerData, RegistrationOutcome, RegistrationStepId, RegistrationStepResult } from "../types";
import { ascii, concatBytes, i64le, u64le } from "./borsh";

// ════════════════════════════════════════════════════════════════════
//  IDL typing (enrg_mvp, copied from ENRG/target/idl/enrg_mvp.json)
// ════════════════════════════════════════════════════════════════════

interface IdlAccountMeta {
  name: string;
  signer?: boolean;
  writable?: boolean;
}
interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts: IdlAccountMeta[];
}
interface EnrgIdl {
  address: string;
  instructions: IdlInstruction[];
}

const idl = enrgIdl as unknown as EnrgIdl;

function getIx(name: string): IdlInstruction {
  const ix = idl.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`Instruction not found in IDL: ${name}`);
  return ix;
}

function ixDiscriminator(name: string): Uint8Array {
  return Uint8Array.from(getIx(name).discriminator);
}

/**
 * Generic Anchor instruction builder: the account order and the discriminator
 * are taken FROM the IDL (prevents drift from the contract); argument data is
 * serialized in the Borsh-compatible order of the `args` fields.
 */
export function buildIxFromIdl(
  programId: PublicKey,
  ixName: string,
  accounts: Record<string, PublicKey>,
  argsBytes: Uint8Array[],
): TransactionInstruction {
  const ix = getIx(ixName);
  const keys = ix.accounts.map((a) => {
    const pubkey = accounts[a.name];
    if (!pubkey) throw new Error(`Account "${a.name}" was not provided for ${ixName}`);
    return { pubkey, isSigner: a.signer === true, isWritable: a.writable === true };
  });
  const data = concatBytes(ixDiscriminator(ixName), ...argsBytes);
  return new TransactionInstruction({ keys, programId, data: Buffer.from(data) });
}

// ════════════════════════════════════════════════════════════════════
//  Messages signed by the DEVICE (mirror security/lifecycle.rs)
//  The format is fixed by the protocol — do not change.
// ════════════════════════════════════════════════════════════════════

const PREFIX_REGISTER = ascii("enrg:device:register");
const PREFIX_CLAIM = ascii("enrg:device:claim");

/** b"enrg:device:register" || device_id(32) || register_timestamp(8 LE) */
export function deviceRegisterMessage(
  deviceId: PublicKey,
  registerTimestamp: bigint,
): Uint8Array {
  return concatBytes(PREFIX_REGISTER, deviceId.toBytes(), i64le(registerTimestamp));
}

/** b"enrg:device:claim" || device_id(32) || owner(32) || nonce(8 LE) || ts(8 LE) */
export function deviceClaimMessage(
  deviceId: PublicKey,
  owner: PublicKey,
  claimNonce: bigint,
  claimTimestamp: bigint,
): Uint8Array {
  return concatBytes(
    PREFIX_CLAIM,
    deviceId.toBytes(),
    owner.toBytes(),
    u64le(claimNonce),
    i64le(claimTimestamp),
  );
}

// ════════════════════════════════════════════════════════════════════
//  PDA derivations (mirror tests/helpers/pda.ts)
// ════════════════════════════════════════════════════════════════════

export function producerPdaSync(programId: PublicKey, deviceId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PRODUCER_SEED), deviceId.toBuffer()],
    programId,
  );
  return pda;
}

export function ownerDevicesPdaSync(programId: PublicKey, owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OWNER_DEVICES_SEED), owner.toBuffer()],
    programId,
  );
  return pda;
}
// ════════════════════════════════════════════════════════════════════
//  On-chain device status (EnergyProducer PDA)
// ════════════════════════════════════════════════════════════════════

const PRODUCER_STATE_OFFSET = 8 + 32 + 32 + 8 + 8 + 8; // discr+authority+device_id+nonce+energy+ts

const STATE_NAMES: DeviceState[] = [
  "Unregistered",
  "Registered",
  "Claimed",
  "Provisioned",
  "Active",
  "Quarantine",
  "Maintenance",
  "Revoked",
];

/** Raw EnergyProducer account data → DeviceState (without heavy borsh). */
export function parseDeviceState(data: Uint8Array | null): DeviceState | null {
  if (!data || data.length < PRODUCER_STATE_OFFSET + 1) return null;
  const idx = data[PRODUCER_STATE_OFFSET];
  return STATE_NAMES[idx] ?? null;
}

export interface DeviceStatus {
  exists: boolean;
  state: DeviceState;
  deviceId: string | null;
  owner: string | null;
  producerPda: string;
}

export async function getDeviceStatus(
  connection: Connection,
  programId: PublicKey,
  deviceId: PublicKey,
): Promise<DeviceStatus> {
  const producer = producerPdaSync(programId, deviceId);
  const info = await connection.getAccountInfo(producer, "confirmed");
  if (!info) {
    return { exists: false, state: "Unregistered", deviceId: null, owner: null, producerPda: producer.toBase58() };
  }
  const state = parseDeviceState(info.data) ?? "Unregistered";
  const owner = new PublicKey(info.data.subarray(8, 40));
  const storedDeviceId = new PublicKey(info.data.subarray(40, 72));
  return {
    exists: true,
    state,
    deviceId: storedDeviceId.toBase58(),
    owner: owner.equals(PublicKey.default) ? null : owner.toBase58(),
    producerPda: producer.toBase58(),
  };
}

// ════════════════════════════════════════════════════════════════════
//  Full EnergyProducer parser (state/producer.rs, all 13 fields)
// ════════════════════════════════════════════════════════════════════

const TIERS = ["Basic", "Verified", "Industrial", "Institutional"] as const;

function u64At(buf: Uint8Array, offset: number): bigint {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return dv.getBigUint64(0, true);
}
function i64At(buf: Uint8Array, offset: number): bigint {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return dv.getBigInt64(0, true);
}

/** Raw EnergyProducer account data → full structure (without Anchor). */
export function parseEnergyProducer(data: Uint8Array, producerPda: PublicKey): EnergyProducerData {
  // discr(8) | authority(32) | device_id(32) | nonce(8) | energy_wh(8) | ts(8)
  // | state(1) | tier(1) | month_energy(8) | month_start(8) | claim_nonce(8)
  // | claimed_at(8) | revoked(1) | rotated_to(32)
  let off = 8;
  const authority = new PublicKey(data.subarray(off, off + 32)).toBase58();
  off += 32;
  const deviceId = new PublicKey(data.subarray(off, off + 32)).toBase58();
  off += 32;
  const nonce = u64At(data, off); off += 8;
  const energyWh = u64At(data, off); off += 8;
  const timestamp = i64At(data, off); off += 8;
  const state = STATE_NAMES[data[off]] ?? "Unregistered"; off += 1;
  const tier = TIERS[data[off]] ?? "Basic"; off += 1;
  const monthEnergyWh = u64At(data, off); off += 8;
  const monthStartTs = i64At(data, off); off += 8;
  const claimNonce = u64At(data, off); off += 8;
  const claimedAt = i64At(data, off); off += 8;
  const revoked = data[off] !== 0; off += 1;
  const rotatedTo = new PublicKey(data.subarray(off, off + 32)).toBase58();

  return {
    authority,
    deviceId,
    nonce,
    energyWh,
    timestamp,
    state,
    tier,
    monthEnergyWh,
    monthStartTs,
    claimNonce,
    claimedAt,
    revoked,
    rotatedTo,
    producerPda: producerPda.toBase58(),
  };
}

/** Fetch and parse the EnergyProducer PDA (null if the account does not exist). */
export async function getEnergyProducer(
  connection: Connection,
  programId: PublicKey,
  deviceId: PublicKey,
): Promise<EnergyProducerData | null> {
  const producer = producerPdaSync(programId, deviceId);
  const info = await connection.getAccountInfo(producer, "confirmed");
  if (!info) return null;
  return parseEnergyProducer(info.data, producer);
}

// ════════════════════════════════════════════════════════════════════
//  Transaction building & sending
// ════════════════════════════════════════════════════════════════════

/** ed25519-precompile instruction (required BEFORE the program instruction). */
export function buildEd25519PrecompileIx(
  publicKey: PublicKey,
  message: Uint8Array,
  signature: Uint8Array,
): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: publicKey.toBytes(),
    message,
    signature,
  });
}

export function buildRegisterDeviceIx(
  programId: PublicKey,
  accounts: { operator: PublicKey; producer: PublicKey; deviceId: PublicKey },
  args: { deviceSignature: Uint8Array; registerTimestamp: bigint },
): TransactionInstruction {
  return buildIxFromIdl(
    programId,
    "register_device",
    {
      operator: accounts.operator,
      producer: accounts.producer,
      device_id: accounts.deviceId, // IDL account name — device_id
      instructions: SYSVAR_INSTRUCTIONS_ID,
      system_program: PublicKey.default,
    },
    [args.deviceSignature, i64le(args.registerTimestamp)],
  );
}

export function buildClaimDeviceIx(
  programId: PublicKey,
  accounts: { authority: PublicKey; producer: PublicKey; ownerDevices: PublicKey },
  args: { deviceSignature: Uint8Array; claimNonce: bigint; claimTimestamp: bigint },
): TransactionInstruction {
  return buildIxFromIdl(
    programId,
    "claim_device",
    {
      authority: accounts.authority,
      producer: accounts.producer,
      owner_devices: accounts.ownerDevices, // IDL account name — owner_devices
      instructions: SYSVAR_INSTRUCTIONS_ID,
      system_program: PublicKey.default,
    },
    [args.deviceSignature, u64le(args.claimNonce), i64le(args.claimTimestamp)],
  );
}

export function buildProvisionDeviceIx(
  programId: PublicKey,
  accounts: { authority: PublicKey; producer: PublicKey },
): TransactionInstruction {
  return buildIxFromIdl(programId, "provision_device", accounts, []);
}

export function buildActivateDeviceIx(
  programId: PublicKey,
  accounts: { authority: PublicKey; producer: PublicKey; ownerDevices: PublicKey },
): TransactionInstruction {
  return buildIxFromIdl(programId, "activate_device", {
    authority: accounts.authority,
    producer: accounts.producer,
    owner_devices: accounts.ownerDevices, // IDL account name — owner_devices
  }, []);
}

/**
 * claim_rewards — withdraw rewards from the staking pool (instruction exists
 * in the IDL). No arguments; accounts: stake_info (StakeInfo, writable) +
 * authority (signer). Requires a StakeInfo account created beforehand (ENRG
 * staking flow).
 */
export function buildClaimRewardsIx(
  programId: PublicKey,
  accounts: { stakeInfo: PublicKey; authority: PublicKey },
): TransactionInstruction {
  return buildIxFromIdl(programId, "claim_rewards", {
    stake_info: accounts.stakeInfo,
    authority: accounts.authority,
  }, []);
}

/** Send a transaction from the user wallet and wait for finalization. */
export async function sendUserTransaction(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
): Promise<string> {
  const tx = new Transaction();
  tx.add(...instructions);
  const signature = await connection.sendTransaction(tx, [payer], {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
// ════════════════════════════════════════════════════════════════════
//  Full registration-flow orchestration (ADR-0005)
// ════════════════════════════════════════════════════════════════════

const STEP_META: Array<{ id: RegistrationStepId; label: string }> = [
  { id: "register", label: "register_device — creating the Producer PDA" },
  { id: "claim", label: "claim_device — linking to your wallet" },
  { id: "provision", label: "provision_device — configuration" },
  { id: "activate", label: "activate_device — activation" },
];

function initialSteps(): RegistrationStepResult[] {
  return STEP_META.map((m) => ({ id: m.id, label: m.label, status: "pending" as const }));
}

function nowTs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export interface RegisterDeviceFlowParams {
  connection: Connection;
  programId?: PublicKey;
  wallet: Keypair;
  deviceId: PublicKey;
  signRegister: (message: Uint8Array) => Promise<Uint8Array>;
  signClaim: (message: Uint8Array) => Promise<Uint8Array>;
  /** Nonce of the first claim (anti-replay). 1 for a new device. */
  claimNonce?: bigint;
}

/**
 * Full Plug&Play flow: register → claim → provision → activate.
 * Steps already performed on-chain (checked via the Producer PDA state) are
 * skipped. Each step is a separate transaction awaited to confirmation.
 */
export async function registerDeviceFlow(
  params: RegisterDeviceFlowParams,
): Promise<RegistrationOutcome> {
  const programId = params.programId ?? ENRG_PROGRAM_ID;
  const steps = initialSteps();
  const set = (id: RegistrationStepId, patch: Partial<RegistrationStepResult>) => {
    const s = steps.find((it) => it.id === id);
    if (s) Object.assign(s, patch);
  };

  try {
    const status = await getDeviceStatus(params.connection, programId, params.deviceId);
    const producer = producerPdaSync(programId, params.deviceId);
    const ownerDevices = ownerDevicesPdaSync(programId, params.wallet.publicKey);
    const walletPub = params.wallet.publicKey;

    if (status.exists && status.owner && status.owner !== walletPub.toBase58()) {
      throw new Error(
        `Device is already bound to another wallet (${status.owner.slice(0, 8)}…). ` +
        `Registration requires a key rotation (rotate_device_key).`,
      );
    }

    const needRegister = !status.exists || status.state === "Unregistered";
    const needClaim = needRegister || status.state === "Registered";
    const needProvision = needClaim || status.state === "Claimed";
    const needActivate = needProvision || status.state === "Provisioned";

    // ── Step 1: register (device signature required) ──
    if (needRegister) {
      const ts = nowTs();
      const message = deviceRegisterMessage(params.deviceId, ts);
      const signature = await params.signRegister(message);
      const ix = buildRegisterDeviceIx(
        programId,
        { operator: walletPub, producer, deviceId: params.deviceId },
        { deviceSignature: signature, registerTimestamp: ts },
      );
      const txid = await sendUserTransaction(params.connection, params.wallet, [
        buildEd25519PrecompileIx(params.deviceId, message, signature),
        ix,
      ]);
      set("register", { status: "ok", txid });
    } else {
      set("register", { status: "skip", error: "PDA already exists" });
    }

    // ── Step 2: claim (device signature required) ──
    if (needClaim) {
      const nonce = params.claimNonce ?? 1n;
      const ts = nowTs();
      const message = deviceClaimMessage(params.deviceId, walletPub, nonce, ts);
      const signature = await params.signClaim(message);
      const ix = buildClaimDeviceIx(
        programId,
        { authority: walletPub, producer, ownerDevices },
        { deviceSignature: signature, claimNonce: nonce, claimTimestamp: ts },
      );
      const txid = await sendUserTransaction(params.connection, params.wallet, [
        buildEd25519PrecompileIx(params.deviceId, message, signature),
        ix,
      ]);
      set("claim", { status: "ok", txid });
    } else {
      set("claim", { status: "skip", error: "already bound" });
    }

    // ── Step 3: provision (owner-gated) ──
    if (needProvision) {
      const txid = await sendUserTransaction(params.connection, params.wallet, [
        buildProvisionDeviceIx(programId, { authority: walletPub, producer }),
      ]);
      set("provision", { status: "ok", txid });
    } else {
      set("provision", { status: "skip", error: "state is beyond Claimed" });
    }

    // ── Step 4: activate (owner-gated) ──
    if (needActivate) {
      const txid = await sendUserTransaction(params.connection, params.wallet, [
        buildActivateDeviceIx(programId, { authority: walletPub, producer, ownerDevices }),
      ]);
      set("activate", { status: "ok", txid });
    } else {
      set("activate", { status: "skip", error: "state is beyond Provisioned" });
    }

    return { deviceId: params.deviceId.toBase58(), steps };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const firstPending = steps.find((s) => s.status === "pending");
    if (firstPending) set(firstPending.id, { status: "error", error: message });
    return { deviceId: params.deviceId.toBase58(), steps, error: message };
  }
}
