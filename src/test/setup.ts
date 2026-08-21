import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import { afterEach, beforeEach } from "vitest";

/**
 * The vitest jsdom environment replaces the global `Uint8Array`/`Buffer` with
 * constructors from another realm: `Buffer.alloc(4) instanceof Uint8Array`
 * becomes false, breaking web3.js (buffer-layout ed25519 encoding,
 * buffer-layout, etc.). Restore the Node versions.
 */
const g = globalThis as unknown as Record<string, unknown>;
const nodeU8 = Object.getPrototypeOf(Buffer.prototype).constructor;
if (!(Buffer.alloc(4) instanceof (g.Uint8Array as typeof Uint8Array))) {
  g.Uint8Array = nodeU8;
  g.Buffer = Buffer;
}

/**
 * web3.js 1.x (CJS) ↔ @noble/curves (ESM): under the vite/vitest transform the
 * `isOnCurve` method stops validating points, so
 * `PublicKey.findProgramAddress(Sync)` fails with
 * "Unable to find a viable program address nonce".
 *
 * Fix: in the test setup, replace findProgramAddress* with an exact replica of
 * the web3.js algorithm (seeds ‖ programId ‖ "ProgramDerivedAddress" → sha256),
 * but with curve checks via a NATIVE CJS require of @noble/curves (in plain
 * Node this path works correctly).
 */
const nativeRequire = createRequire(import.meta.url);

const nativeEd = (() => {
  try {
    return nativeRequire("@noble/curves/ed25519") as {
      ed25519: { ExtendedPoint: { fromHex(b: Uint8Array): unknown } };
    };
  } catch {
    return null;
  }
})();

/** sha256 via node:crypto (no ESM-interop realm issues). */
const nativeSha256 = (() => {
  try {
    const { createHash } = nativeRequire("node:crypto") as typeof import("node:crypto");
    return (b: Uint8Array) => createHash("sha256").update(b).digest();
  } catch {
    return null;
  }
})();

function nativeIsOnCurve(bytes: Uint8Array): boolean {
  if (!nativeEd) return false;
  try {
    nativeEd.ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

if (nativeEd && nativeSha256) {
  PublicKey.findProgramAddressSync = (seeds, programId) => {
    for (let nonce = 255; nonce > 0; nonce--) {
      const allSeeds = [...seeds, Uint8Array.of(nonce)];
      if (allSeeds.some((s) => s.length > 32)) {
        throw new TypeError("Max seed length exceeded");
      }
      const buffer = Buffer.concat([
        ...allSeeds.map((s) => Buffer.from(s)),
        programId.toBuffer(),
        Buffer.from("ProgramDerivedAddress"),
      ]);
      const hash = nativeSha256(buffer);
      if (!nativeIsOnCurve(hash)) {
        return [new PublicKey(hash), nonce];
      }
    }
    throw new Error("Unable to find a viable program address nonce");
  };
  PublicKey.findProgramAddress = async (seeds, programId) =>
    PublicKey.findProgramAddressSync(seeds, programId);
  // eslint-disable-next-line no-console
  console.debug("[setup] findProgramAddress patched with native @noble/curves");
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

