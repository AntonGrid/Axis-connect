import { describe, expect, it } from "vitest";
import {
  base58Decode,
  base58Encode,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
} from "../lib/encoding";

describe("encoding", () => {
  it("base58 round-trip", () => {
    const bytes = new Uint8Array(32).fill(7);
    const enc = base58Encode(bytes);
    expect(enc).not.toContain("0");
    expect([...base58Decode(enc)]).toEqual([...bytes]);
  });

  it("hex round-trip + 0x prefix", () => {
    const bytes = new Uint8Array([0xab, 0xcd, 0x01, 0xff]);
    expect(bytesToHex(bytes)).toBe("abcd01ff");
    expect([...hexToBytes("0xABCD01ff")]).toEqual([...bytes]);
    expect(() => hexToBytes("abc")).toThrow();
    expect(() => hexToBytes("zz")).toThrow();
  });

  it("base64 round-trip", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
});
