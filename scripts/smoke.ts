/**
 * Smoke test (dev-only, not part of the production build).
 * Checks:
 *  1. argument/account serialization of the register/claim/provision/activate instructions;
 *  2. lengths and structure of the canonical device messages;
 *  3. QR payload parsing and deviceId normalization;
 *  4. PDA derivations.
 *
 * Run:
 *   npm run smoke
 */
import { PublicKey } from "@solana/web3.js";
import {
  buildRegisterDeviceIx,
  buildClaimDeviceIx,
  buildProvisionDeviceIx,
  buildActivateDeviceIx,
  deviceRegisterMessage,
  deviceClaimMessage,
  producerPdaSync,
  ownerDevicesPdaSync,
} from "../src/lib/enrgTx";
import { parseDeviceQrPayload, normalizeDeviceId } from "../src/lib/qr";
import { ENRG_PROGRAM_ID } from "../src/config";

const deviceId = new PublicKey("AxJsXqX9YxD3pz2w7e7cJdQpP7oFg9vHsE9kX2vYjWmN");
const operator = new PublicKey("4uQeVj5tqViQh7yWWG4vkSLPmNxL7fsXtvxQMpEzpNfQ");
const producer = producerPdaSync(ENRG_PROGRAM_ID, deviceId);
const ownerDevices = ownerDevicesPdaSync(ENRG_PROGRAM_ID, operator);

const sig = new Uint8Array(64).fill(0xab);
const ts = BigInt(1_700_000_000);
const nonce = 1n;

const ixRegister = buildRegisterDeviceIx(
  ENRG_PROGRAM_ID,
  { operator, producer, deviceId },
  { deviceSignature: sig, registerTimestamp: ts },
);
const ixClaim = buildClaimDeviceIx(
  ENRG_PROGRAM_ID,
  { authority: operator, producer, ownerDevices },
  { deviceSignature: sig, claimNonce: nonce, claimTimestamp: ts },
);
const ixProvision = buildProvisionDeviceIx(ENRG_PROGRAM_ID, { authority: operator, producer });
const ixActivate = buildActivateDeviceIx(ENRG_PROGRAM_ID, {
  authority: operator,
  producer,
  ownerDevices,
});

console.log("register_data_hex  =", Buffer.from(ixRegister.data).toString("hex"));
console.log("claim_data_hex     =", Buffer.from(ixClaim.data).toString("hex"));
console.log("provision_data_hex =", Buffer.from(ixProvision.data).toString("hex"));
console.log("activate_data_hex  =", Buffer.from(ixActivate.data).toString("hex"));

console.log("register_keys =", ixRegister.keys.map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? "s" : ""}${k.isWritable ? "w" : ""}`).join(" "));
console.log("claim_keys    =", ixClaim.keys.map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? "s" : ""}${k.isWritable ? "w" : ""}`).join(" "));

// Messages
const regMsg = deviceRegisterMessage(deviceId, ts);
const claimMsg = deviceClaimMessage(deviceId, operator, nonce, ts);
console.log("\nregister_msg len =", regMsg.length, "(expected 60)");
console.log("claim_msg len    =", claimMsg.length, "(expected 97)");
console.log("register_msg prefix =", Buffer.from(regMsg.subarray(0, 20)).toString("utf8"));
console.log("claim_msg prefix    =", Buffer.from(claimMsg.subarray(0, 17)).toString("utf8"));

// QR parsing
const qrJson = JSON.stringify({ deviceId: deviceId.toBase58(), schema: "axis-energy-v1" });
const parsed = parseDeviceQrPayload(qrJson);
console.log("\nQR parsed deviceId =", parsed.deviceId.toBase58(), "| hex =", parsed.deviceIdHex);
const hexVariant = parseDeviceQrPayload(
  JSON.stringify({ deviceId: parsed.deviceIdHex, schema: "axis-energy-v1" }),
);
console.log("QR hex-variant OK =", hexVariant.deviceId.equals(deviceId));

try {
  parseDeviceQrPayload(JSON.stringify({ deviceId: deviceId.toBase58(), schema: "other" }));
  console.log("BAD: wrong schema accepted");
} catch (e) {
  console.log("wrong schema rejected:", (e as Error).message);
}

// PDA
console.log("\nproducerPda    =", producer.toBase58());
console.log("ownerDevicesPda=", ownerDevices.toBase58());

// Validate lengths and prefixes
const ok =
  regMsg.length === 60 &&
  claimMsg.length === 97 &&
  ixRegister.data.length === 8 + 64 + 8 &&
  ixClaim.data.length === 8 + 64 + 8 + 8 &&
  ixProvision.data.length === 8 &&
  ixActivate.data.length === 8;
console.log("\nSMOKE", ok ? "PASS" : "FAIL");
if (!ok) process.exit(1);
