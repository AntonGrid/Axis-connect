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
import type { DeviceState, RegistrationOutcome, RegistrationStepId, RegistrationStepResult } from "../types";
import { ascii, concatBytes, i64le, u64le } from "./borsh";

// ════════════════════════════════════════════════════════════════════
//  IDL-типизация (enrg_mvp, скопирован из ENRG/target/idl/enrg_mvp.json)
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
  if (!ix) throw new Error(`Инструкция отсутствует в IDL: ${name}`);
  return ix;
}

function ixDiscriminator(name: string): Uint8Array {
  return Uint8Array.from(getIx(name).discriminator);
}

/**
 * Универсальный строитель Anchor-инструкции: порядок аккаунтов и дискриминатор
 * берутся ИЗ IDL (исключает рассинхронизацию с контрактом), данные аргументов
 * сериализуются в Borsh-совместимом порядке полей `args`.
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
    if (!pubkey) throw new Error(`Аккаунт "${a.name}" не передан для ${ixName}`);
    return { pubkey, isSigner: a.signer === true, isWritable: a.writable === true };
  });
  const data = concatBytes(ixDiscriminator(ixName), ...argsBytes);
  return new TransactionInstruction({ keys, programId, data: Buffer.from(data) });
}

// ════════════════════════════════════════════════════════════════════
//  Сообщения, подписываемые УСТРОЙСТВОМ (зеркалят security/lifecycle.rs)
//  Формат зафиксирован протоколом — менять нельзя.
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
//  PDA-деривации (зеркалят tests/helpers/pda.ts)
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
//  On-chain статус устройства (EnergyProducer PDA)
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

/** Сырые данные аккаунта EnergyProducer → DeviceState (без тяжёлого borsh). */
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
//  Сборка и отправка транзакций
// ════════════════════════════════════════════════════════════════════

/** ed25519-precompile-инструкция (обязательна ПЕРЕД program-инструкцией). */
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
      device_id: accounts.deviceId, // имя аккаунта в IDL — device_id
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
      owner_devices: accounts.ownerDevices, // имя аккаунта в IDL — owner_devices
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
    owner_devices: accounts.ownerDevices, // имя аккаунта в IDL — owner_devices
  }, []);
}

/** Отправка транзакции от кошелька пользователя + ожидание финализации. */
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
//  Оркестрация полного флоу регистрации (ADR-0005)
// ════════════════════════════════════════════════════════════════════

const STEP_META: Array<{ id: RegistrationStepId; label: string }> = [
  { id: "register", label: "register_device — создание Producer PDA" },
  { id: "claim", label: "claim_device — привязка к вашему кошельку" },
  { id: "provision", label: "provision_device — настройка" },
  { id: "activate", label: "activate_device — активация" },
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
  /** Nonce первого claim (анти-replay). Для нового девайса = 1. */
  claimNonce?: bigint;
}

/**
 * Полный Plug&Play-флоу: register → claim → provision → activate.
 * Шаги, уже выполненные on-chain (проверяется по состоянию Producer PDA),
 * пропускаются. Каждый шаг — отдельная транзакция с ожиданием подтверждения.
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
        `Устройство уже привязано к другому кошельку (${status.owner.slice(0, 8)}…). ` +
        `Регистрация невозможна без ротации (rotate_device_key).`,
      );
    }

    const needRegister = !status.exists || status.state === "Unregistered";
    const needClaim = needRegister || status.state === "Registered";
    const needProvision = needClaim || status.state === "Claimed";
    const needActivate = needProvision || status.state === "Provisioned";

    // ── Шаг 1: register (нужна подпись устройства) ──
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
      set("register", { status: "skip", error: "PDA уже существует" });
    }

    // ── Шаг 2: claim (нужна подпись устройства) ──
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
      set("claim", { status: "skip", error: "уже привязано" });
    }

    // ── Шаг 3: provision (owner-gated) ──
    if (needProvision) {
      const txid = await sendUserTransaction(params.connection, params.wallet, [
        buildProvisionDeviceIx(programId, { authority: walletPub, producer }),
      ]);
      set("provision", { status: "ok", txid });
    } else {
      set("provision", { status: "skip", error: "состояние дальше Claimed" });
    }

    // ── Шаг 4: activate (owner-gated) ──
    if (needActivate) {
      const txid = await sendUserTransaction(params.connection, params.wallet, [
        buildActivateDeviceIx(programId, { authority: walletPub, producer, ownerDevices }),
      ]);
      set("activate", { status: "ok", txid });
    } else {
      set("activate", { status: "skip", error: "состояние дальше Provisioned" });
    }

    return { deviceId: params.deviceId.toBase58(), steps };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const firstPending = steps.find((s) => s.status === "pending");
    if (firstPending) set(firstPending.id, { status: "error", error: message });
    return { deviceId: params.deviceId.toBase58(), steps, error: message };
  }
}
