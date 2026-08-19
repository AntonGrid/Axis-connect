import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import { afterEach, beforeEach } from "vitest";

/**
 * jsdom-окружение vitest подменяет глобальные `Uint8Array`/`Buffer` на
 * конструкторы из другого realm: `Buffer.alloc(4) instanceof Uint8Array`
 * становится false, из-за чего web3.js (буфер-layout энкод ed25519,
 * buffer-layout и т.д.) ломается. Возвращаем Node-версии.
 */
const g = globalThis as unknown as Record<string, unknown>;
const nodeU8 = Object.getPrototypeOf(Buffer.prototype).constructor;
if (!(Buffer.alloc(4) instanceof (g.Uint8Array as typeof Uint8Array))) {
  g.Uint8Array = nodeU8;
  g.Buffer = Buffer;
}

/**
 * web3.js 1.x (CJS) ↔ @noble/curves (ESM): в трансформе vite/vitest метод
 * `isOnCurve` перестаёт валидировать точки, из-за чего
 * `PublicKey.findProgramAddress(Sync)` падает с
 * "Unable to find a viable program address nonce".
 *
 * Решение: в тестовом setup подменяем findProgramAddress* на точную реплику
 * алгоритма web3.js (seeds ‖ programId ‖ "ProgramDerivedAddress" → sha256),
 * но с проверкой кривой через НАТИВНЫЙ CJS-require @noble/curves (в plain
 * Node этот путь работает корректно).
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

/** sha256 через node:crypto (без realm-проблем ESM-интеропа). */
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

