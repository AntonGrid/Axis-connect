import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { normalizeDeviceId, parseDeviceQrPayload } from "../lib/qr";

const DEVICE_BASE58 = "AxJsXqX9YxD3pz2w7e7cJdQpP7oFg9vHsE9kX2vYjWmN";

describe("qr parser", () => {
  it("parses base58 deviceId", () => {
    const res = parseDeviceQrPayload(
      JSON.stringify({ deviceId: DEVICE_BASE58, schema: "axis-energy-v1" }),
    );
    expect(res.deviceId.toBase58()).toBe(DEVICE_BASE58);
    expect(res.deviceIdHex.startsWith("0x")).toBe(true);
    expect(res.deviceIdHex).toHaveLength(66);
  });

  it("parses 0x-hex deviceId", () => {
    const hex = "0x" + Buffer.from(new PublicKey(DEVICE_BASE58).toBytes()).toString("hex");
    const res = parseDeviceQrPayload(JSON.stringify({ deviceId: hex, schema: "axis-energy-v1" }));
    expect(res.deviceId.toBase58()).toBe(DEVICE_BASE58);
  });

  it("rejects wrong schema", () => {
    expect(() =>
      parseDeviceQrPayload(JSON.stringify({ deviceId: DEVICE_BASE58, schema: "other" })),
    ).toThrow(/schema/);
  });

  it("rejects invalid json", () => {
    expect(() => parseDeviceQrPayload("not-json")).toThrow();
  });

  it("rejects invalid key length", () => {
    expect(() =>
      parseDeviceQrPayload(JSON.stringify({ deviceId: "abc", schema: "axis-energy-v1" })),
    ).toThrow(/32/);
  });

  it("normalizeDeviceId handles both formats", () => {
    expect(normalizeDeviceId(DEVICE_BASE58).toBase58()).toBe(DEVICE_BASE58);
    const hex = "0x" + Buffer.from(new PublicKey(DEVICE_BASE58).toBytes()).toString("hex");
    expect(normalizeDeviceId(hex).toBase58()).toBe(DEVICE_BASE58);
  });
});
