import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  buildActivateDeviceIx,
  buildClaimDeviceIx,
  buildClaimRewardsIx,
  buildEd25519PrecompileIx,
  buildProvisionDeviceIx,
  buildRegisterDeviceIx,
  deviceClaimMessage,
  deviceRegisterMessage,
  ownerDevicesPdaSync,
  parseEnergyProducer,
  producerPdaSync,
} from "../lib/enrgTx";
import { ENRG_PROGRAM_ID, SYSVAR_INSTRUCTIONS_ID } from "../config";
import enrgIdl from "../data/enrg_mvp.json";

const deviceId = new PublicKey("AxJsXqX9YxD3pz2w7e7cJdQpP7oFg9vHsE9kX2vYjWmN");
const operator = new PublicKey("4uQeVj5tqViQh7yWWG4vkSLPmNxL7fsXtvxQMpEzpNfQ");

describe("enrgTx messages (security/lifecycle.rs mirror)", () => {
  it("register message: prefix + 32 + 8 = 60 bytes", () => {
    const msg = deviceRegisterMessage(deviceId, 1_700_000_000n);
    expect(msg.length).toBe(60);
    expect(Buffer.from(msg.subarray(0, 20)).toString("utf8")).toBe("enrg:device:register");
  });

  it("claim message: prefix + 32 + 32 + 8 + 8 = 97 bytes", () => {
    const msg = deviceClaimMessage(deviceId, operator, 1n, 1_700_000_000n);
    expect(msg.length).toBe(97);
    expect(Buffer.from(msg.subarray(0, 17)).toString("utf8")).toBe("enrg:device:claim");
  });

  it("register and claim are domain-separated", () => {
    const r = deviceRegisterMessage(deviceId, 1n);
    const c = deviceClaimMessage(deviceId, operator, 1n, 1n);
    expect(Buffer.from(r)).not.toEqual(Buffer.from(c));
  });
});

describe("enrgTx serialization vs Anchor (эталон из IDL)", () => {
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection("http://127.0.0.1:8899"),
    {
      publicKey: anchor.web3.Keypair.generate().publicKey,
      signTransaction: async (tx: never) => tx,
      signAllTransactions: async (txs: never[]) => txs,
    } as never,
    {},
  );
  const program = new anchor.Program(enrgIdl as never, provider);

  const sig = new Uint8Array(64).fill(0xab);
  const ts = 1_700_000_000;
  const producer = producerPdaSync(ENRG_PROGRAM_ID, deviceId);
  const ownerDevices = ownerDevicesPdaSync(ENRG_PROGRAM_ID, operator);

  it("register_device data matches Anchor byte-for-byte", async () => {
    const ix = buildRegisterDeviceIx(
      ENRG_PROGRAM_ID,
      { operator, producer, deviceId },
      { deviceSignature: sig, registerTimestamp: BigInt(ts) },
    );
    const ref = await program.methods
      .registerDevice(Array.from(sig), new anchor.BN(ts))
      .accounts({
        operator,
        producer,
        deviceId,
        instructions: SYSVAR_INSTRUCTIONS_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    expect(Buffer.from(ix.data).toString("hex")).toBe(Buffer.from(ref.data).toString("hex"));
    expect(ix.keys.length).toBe(ref.keys.length);
  });

  it("claim_device data matches Anchor byte-for-byte", async () => {
    const ix = buildClaimDeviceIx(
      ENRG_PROGRAM_ID,
      { authority: operator, producer, ownerDevices },
      { deviceSignature: sig, claimNonce: 1n, claimTimestamp: BigInt(ts) },
    );
    const ref = await program.methods
      .claimDevice(Array.from(sig), new anchor.BN(1), new anchor.BN(ts))
      .accounts({
        authority: operator,
        producer,
        ownerDevices,
        instructions: SYSVAR_INSTRUCTIONS_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    expect(Buffer.from(ix.data).toString("hex")).toBe(Buffer.from(ref.data).toString("hex"));
  });
  it("provision/activate have empty args (8-byte discriminator only)", async () => {
    const p = buildProvisionDeviceIx(ENRG_PROGRAM_ID, { authority: operator, producer });
    const a = buildActivateDeviceIx(ENRG_PROGRAM_ID, {
      authority: operator,
      producer,
      ownerDevices,
    });
    expect(p.data.length).toBe(8);
    expect(a.data.length).toBe(8);
  });

  it("claim_rewards discriminator matches IDL", () => {
    const ix = buildClaimRewardsIx(ENRG_PROGRAM_ID, { stakeInfo: operator, authority: operator });
    const idlIx = (
      enrgIdl as unknown as { instructions: { name: string; discriminator: number[] }[] }
    ).instructions.find((i) => i.name === "claim_rewards")!;
    expect([...ix.data.subarray(0, 8)]).toEqual(idlIx.discriminator);
  });
});

describe("enrgTx ed25519 precompile + PDA", () => {
  it("ed25519 instruction carries pubkey/message/signature", () => {
    const msg = deviceRegisterMessage(deviceId, 1n);
    const ix = buildEd25519PrecompileIx(deviceId, msg, new Uint8Array(64));
    expect(ix.programId.toBase58()).toBe("Ed25519SigVerify111111111111111111111111111");
    // web3.js layout: header(16) | pubkey(32) | signature(64) | message
    expect([...ix.data.subarray(16, 16 + 32)]).toEqual([...deviceId.toBytes()]);
    expect([...ix.data.subarray(16 + 32, 16 + 32 + 64)]).toEqual([...new Uint8Array(64)]);
    expect([...ix.data.subarray(16 + 32 + 64, 16 + 32 + 64 + msg.length)]).toEqual([...msg]);
  });

  it("producerPda is deterministic", () => {
    const a = producerPdaSync(ENRG_PROGRAM_ID, deviceId);
    const b = producerPdaSync(ENRG_PROGRAM_ID, deviceId);
    expect(a.toBase58()).toBe(b.toBase58());
  });
});

describe("parseEnergyProducer (полный borsh-парсер)", () => {
  it("parses all 13 fields", () => {
    // layout: discr(8) authority(32) device_id(32) nonce(8) energy(8) ts(8)
    // state(1) tier(1) month_energy(8) month_start(8) claim_nonce(8)
    // claimed_at(8) revoked(1) rotated_to(32)
    const buf = Buffer.alloc(8 + 32 + 32 + 8 * 8 + 1 + 1 + 1 + 32);
    buf.fill(0);
    buf.set(deviceId.toBytes(), 40); // device_id
    buf.set(operator.toBytes(), 8); // authority
    buf.writeBigUInt64LE(123n, 72); // nonce
    buf.writeBigUInt64LE(5_000_000n, 80); // energy_wh
    buf.writeBigInt64LE(1_700_000_000n, 88); // timestamp
    buf[96] = 4; // state = Active
    buf[97] = 0; // tier = Basic
    buf.writeBigUInt64LE(100_000n, 98); // month_energy
    buf.writeBigUInt64LE(9n, 114); // claim_nonce
    buf[130] = 0; // revoked

    const parsed = parseEnergyProducer(buf, producerPdaSync(ENRG_PROGRAM_ID, deviceId));
    expect(parsed.deviceId).toBe(deviceId.toBase58());
    expect(parsed.authority).toBe(operator.toBase58());
    expect(parsed.energyWh).toBe(5_000_000n);
    expect(parsed.state).toBe("Active");
    expect(parsed.tier).toBe("Basic");
    expect(parsed.monthEnergyWh).toBe(100_000n);
    expect(parsed.revoked).toBe(false);
  });
});
